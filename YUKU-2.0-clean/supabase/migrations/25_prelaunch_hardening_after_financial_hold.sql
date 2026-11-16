-- ============================================================================
-- YUKU MIGRATION 25: HARDENING PRA-LAUNCH (MERGED AFTER C6 MIGRATIONS 23-24)
-- Append-only. Terapkan SETELAH migrasi 01-24 di staging, lalu jalankan
-- supabase/tests/stage_c_security_tests.sql dan supabase/ops/post_deploy_checks.sql.
--
-- 1) Menutup INSERT langsung ke public.bookings / booking_status_history oleh
--    authenticated. Sebelumnya Customer bisa melewati create_booking() (flag
--    payment_checkout, verifikasi KTP, validasi Talent) dan bahkan menyisipkan
--    booking dengan status selain pending_payment.
-- 2) Memperbaiki guard settle_booking_payment() (current_user -> session_user/JWT).
-- 3) Memberi batas ukuran dan tipe file pada bucket publik 'promotions'.
-- 4) Menambahkan kolom talent_profiles.is_approved yang dirujuk oleh
--    create_booking(), admin_review_talent() dan get_admin_dashboard_overview()
--    tetapi tidak pernah dibuat oleh migrasi 01-24 (RPC itu akan error saat runtime).
-- 5) Memperbaiki guard_booking_status_actor() agar jalur backend (webhook, cron,
--    trigger sistem) tidak diblokir oleh aturan "hanya backend/Admin".
-- ============================================================================

-- 1) Booking hanya dibuat lewat RPC create_booking() (SECURITY DEFINER).
DROP POLICY IF EXISTS "bookings_insert_customer" ON public.bookings;
REVOKE INSERT ON public.bookings FROM authenticated;
REVOKE INSERT (booking_code, customer_id, talent_id, activity_category_id, booking_mode,
               start_time, end_time, duration_hours, meeting_location_name,
               meeting_location_address, status)
  ON public.bookings FROM authenticated;

-- Riwayat status ditulis oleh trigger/RPC tepercaya, bukan klien.
DROP POLICY IF EXISTS "status_history_insert_authenticated" ON public.booking_status_history;
REVOKE INSERT ON public.booking_status_history FROM authenticated;
REVOKE INSERT (booking_id, previous_status, new_status, changed_by_user_id, notes, actor_type)
  ON public.booking_status_history FROM authenticated;

-- Pertahanan berlapis: booking baru WAJIB berstatus pending_payment.
CREATE OR REPLACE FUNCTION public.guard_booking_insert_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending_payment'::public.booking_status_type THEN
    RAISE EXCEPTION 'Booking baru hanya boleh dibuat dengan status pending_payment.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_booking_insert_status ON public.bookings;
CREATE TRIGGER trg_guard_booking_insert_status
BEFORE INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.guard_booking_insert_status();
REVOKE ALL ON FUNCTION public.guard_booking_insert_status() FROM PUBLIC, anon, authenticated;

-- 2) settle_booking_payment(): guard yang benar-benar bekerja.
CREATE OR REPLACE FUNCTION public.settle_booking_payment(
  p_booking_id UUID,
  p_provider public.payment_provider_type DEFAULT 'xendit',
  p_provider_charge_id TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'qris',
  p_webhook_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN AS $$
DECLARE
  v_booking RECORD;
BEGIN
  -- NOTE: di fungsi SECURITY DEFINER, current_user selalu pemilik fungsi (postgres),
  -- sehingga HARUS memakai session_user / klaim JWT. Admin sengaja tidak diizinkan
  -- menandai pembayaran lunas; hanya backend (service_role) setelah webhook terverifikasi.
  IF session_user NOT IN ('postgres', 'supabase_admin')
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Akses Ditolak: settle_booking_payment hanya boleh dipanggil dari server (service_role).';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % tidak ditemukan.', p_booking_id;
  END IF;

  -- Idempotent: jika sudah dibayar/escrow, anggap sukses
  IF v_booking.status <> 'pending_payment'::public.booking_status_type THEN
    IF v_booking.status IN (
      'paid_held_in_escrow'::public.booking_status_type,
      'confirmed_by_talent'::public.booking_status_type,
      'in_progress'::public.booking_status_type,
      'completed'::public.booking_status_type
    ) THEN
      RETURN TRUE;
    END IF;
    RAISE EXCEPTION 'Booking % sudah berstatus % dan tidak dapat dibayar.', p_booking_id, v_booking.status;
  END IF;

  IF v_booking.payment_expires_at <= NOW() THEN
    UPDATE public.bookings
    SET status = 'expired'::public.booking_status_type,
        cancellation_reason = 'Batas waktu pembayaran 15 menit telah habis',
        updated_at = NOW()
    WHERE id = p_booking_id;

    RAISE EXCEPTION 'Batas waktu pembayaran untuk booking % telah kedaluwarsa.', p_booking_id;
  END IF;

  -- Upsert ke public.payments dengan status settled_held (memicu ledger escrow otomatis)
  INSERT INTO public.payments (
    booking_id,
    provider,
    provider_charge_id,
    payment_method,
    amount,
    payment_status,
    paid_at,
    webhook_payload_history
  ) VALUES (
    v_booking.id,
    p_provider,
    p_provider_charge_id,
    COALESCE(NULLIF(TRIM(p_payment_method), ''), 'qris'),
    v_booking.gross_amount,
    'settled_held'::public.payment_status_type,
    NOW(),
    ARRAY[COALESCE(p_webhook_payload, '{}'::jsonb)]
  )
  ON CONFLICT (booking_id) DO UPDATE SET
    provider = EXCLUDED.provider,
    provider_charge_id = COALESCE(EXCLUDED.provider_charge_id, public.payments.provider_charge_id),
    payment_method = EXCLUDED.payment_method,
    payment_status = 'settled_held'::public.payment_status_type,
    paid_at = COALESCE(public.payments.paid_at, NOW()),
    webhook_payload_history = array_append(public.payments.webhook_payload_history, COALESCE(p_webhook_payload, '{}'::jsonb)),
    updated_at = NOW();

  UPDATE public.bookings
  SET status = 'paid_held_in_escrow'::public.booking_status_type,
      updated_at = NOW()
  WHERE id = v_booking.id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.settle_booking_payment(UUID, public.payment_provider_type, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_booking_payment(UUID, public.payment_provider_type, TEXT, TEXT, JSONB) TO service_role;

-- 3) Bucket 'promotions' (publik): batasi ukuran & tipe file.
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'promotions';


-- 4) FIX KRITIS: guard_booking_status_actor (migrasi 21) menolak SEMUA perubahan ke
--    paid_held_in_escrow / expired / refunded untuk non-admin, sehingga pelunasan
--    webhook (service_role), cron kedaluwarsa, dan create_booking() (yang memanggil
--    expire_stale_booking_reservations() via trigger) akan gagal di runtime.
CREATE OR REPLACE FUNCTION public.guard_booking_status_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Jalur backend tepercaya: cron/SQL owner, service_role (webhook pembayaran), dan
  -- perubahan yang dilakukan dari dalam trigger/fungsi SECURITY DEFINER lain
  -- (mis. expire_stale_booking_reservations() yang dipanggil trigger harga saat
  -- create_booking()). Update langsung dari klien selalu berada di trigger depth 1.
  IF session_user IN ('postgres', 'supabase_admin')
     OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
     OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled_by_customer'::public.booking_status_type THEN
    IF v_actor IS NULL OR v_actor <> OLD.customer_id THEN
      RAISE EXCEPTION 'Hanya Customer pemesan yang dapat membatalkan booking sebagai cancelled_by_customer.';
    END IF;

  ELSIF NEW.status = 'cancelled_by_talent'::public.booking_status_type THEN
    IF v_actor IS NULL OR v_actor <> OLD.talent_id THEN
      RAISE EXCEPTION 'Hanya Talent pemilik booking yang dapat membatalkan booking sebagai cancelled_by_talent.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.refunds rf
      WHERE rf.booking_id = OLD.id
        AND rf.customer_id = OLD.customer_id
        AND rf.refund_amount >= OLD.gross_amount
        AND rf.status = 'requested'::public.refund_status_type
    ) THEN
      RAISE EXCEPTION 'Pembatalan Talent harus membuat permintaan refund penuh terlebih dahulu.';
    END IF;

  ELSIF NEW.status IN (
    'confirmed_by_talent'::public.booking_status_type,
    'in_progress'::public.booking_status_type
  ) THEN
    IF v_actor IS NULL OR v_actor <> OLD.talent_id THEN
      RAISE EXCEPTION 'Hanya Talent pemilik booking yang dapat mengubah status sesi ini.';
    END IF;

  ELSIF NEW.status = 'completed'::public.booking_status_type THEN
    IF NEW.customer_completed_at IS NULL OR NEW.talent_completed_at IS NULL THEN
      RAISE EXCEPTION 'Booking hanya dapat selesai setelah Customer dan Talent sama-sama mengonfirmasi sesi.';
    END IF;

  ELSIF NEW.status = 'disputed_hold'::public.booking_status_type THEN
    IF v_actor IS NULL OR v_actor NOT IN (OLD.customer_id, OLD.talent_id) THEN
      RAISE EXCEPTION 'Hanya peserta booking atau Admin yang dapat menahan booking karena sengketa.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.reports_complaints rc
      WHERE rc.booking_id = OLD.id
        AND rc.status IN ('open'::public.report_status_type, 'investigating'::public.report_status_type)
    ) THEN
      RAISE EXCEPTION 'Booking hanya dapat ditahan jika ada laporan sengketa aktif.';
    END IF;

  ELSIF NEW.status IN (
    'paid_held_in_escrow'::public.booking_status_type,
    'refunded'::public.booking_status_type,
    'expired'::public.booking_status_type
  ) THEN
    RAISE EXCEPTION 'Perubahan status ini hanya boleh dilakukan backend pembayaran atau Admin.';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_booking_status_actor() FROM PUBLIC, anon, authenticated;


-- 5) Kolom kurasi Talent. Tidak diberi GRANT INSERT/UPDATE ke authenticated
--    (grant kolom di migrasi 06 sudah eksplisit), jadi Talent tidak bisa menyetujui diri sendiri.
ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill konservatif: hanya Talent yang sudah aktif, 18+ terverifikasi, dan KTP verified.
UPDATE public.talent_profiles tp
SET is_approved = TRUE
FROM public.users u, public.user_identities ui
WHERE tp.is_approved = FALSE
  AND u.id = tp.id
  AND ui.id = tp.id
  AND u.account_status = 'active'::public.account_status_type
  AND u.is_verified_18 IS TRUE
  AND ui.ktp_verification_status = 'verified'::public.ktp_status_type;

CREATE INDEX IF NOT EXISTS idx_talent_profiles_is_approved ON public.talent_profiles(is_approved) WHERE is_approved;
