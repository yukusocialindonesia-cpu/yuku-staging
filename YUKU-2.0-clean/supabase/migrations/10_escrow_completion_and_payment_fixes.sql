-- ============================================================================
-- MIGRATION 10: ESCROW COMPLETION TIMESTAMPS, CRON RELEASE & PAYMENT WEBHOOK RPC
-- ============================================================================
-- Jalankan file ini di Supabase Dashboard -> SQL Editor (sebagai role postgres).
-- File ini bersifat idempoten dan aman dijalankan ulang.

-- 1. Trigger otomatis mengisi completion_confirmed_at & escrow_release_scheduled_at
--    saat booking berubah status menjadi 'completed'.
CREATE OR REPLACE FUNCTION public.set_booking_completion_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed'::public.booking_status_type
     AND (OLD.status IS DISTINCT FROM 'completed'::public.booking_status_type) THEN
    IF NEW.completion_confirmed_at IS NULL THEN
      NEW.completion_confirmed_at := NOW();
    END IF;
    IF NEW.escrow_release_scheduled_at IS NULL THEN
      NEW.escrow_release_scheduled_at := NEW.completion_confirmed_at + INTERVAL '24 HOURS';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_set_booking_completion_timestamps ON public.bookings;
CREATE TRIGGER trg_set_booking_completion_timestamps
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.set_booking_completion_timestamps();

-- Backfill booking 'completed' lama yang belum punya completion_confirmed_at
UPDATE public.bookings
SET completion_confirmed_at = COALESCE(updated_at, end_time, NOW()),
    escrow_release_scheduled_at = COALESCE(updated_at, end_time, NOW()) + INTERVAL '24 HOURS'
WHERE status = 'completed'::public.booking_status_type
  AND completion_confirmed_at IS NULL;

-- 2. Pastikan trigger ledger keuangan juga berjalan saat INSERT maupun UPDATE
DROP TRIGGER IF EXISTS trg_auto_generate_booking_financial_ledgers ON public.payments;
CREATE TRIGGER trg_auto_generate_booking_financial_ledgers
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.auto_generate_booking_financial_ledgers();

-- 3. Perbarui process_escrow_release() agar aman dijalankan oleh pg_cron (postgres)
--    dan service_role/admin, sekaligus tetap menolak anon/authenticated biasa.
CREATE OR REPLACE FUNCTION public.process_escrow_release()
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
  v_rec RECORD;
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses Ditolak: Fungsi pelepasan escrow hanya dapat dijalankan oleh cron/service_role/admin.';
  END IF;

  FOR v_rec IN
    SELECT b.id AS booking_id, b.talent_id
    FROM public.bookings b
    WHERE b.status = 'completed'::public.booking_status_type
      AND b.completion_confirmed_at IS NOT NULL
      AND b.completion_confirmed_at <= (NOW() - INTERVAL '24 HOURS')
      AND NOT EXISTS (
        SELECT 1 FROM public.reports_complaints rc
        WHERE rc.booking_id = b.id
          AND rc.status IN ('open'::public.report_status_type, 'investigating'::public.report_status_type)
      )
    FOR UPDATE OF b SKIP LOCKED
  LOOP
    UPDATE public.talent_earnings
    SET status = 'available_for_payout'::public.talent_earning_status_type,
        available_at = NOW()
    WHERE booking_id = v_rec.booking_id
      AND status = 'held_in_escrow'::public.talent_earning_status_type;

    UPDATE public.referral_rewards
    SET status = 'credited'::public.referral_reward_status_type,
        credited_at = NOW()
    WHERE booking_id = v_rec.booking_id
      AND status = 'pending_completion'::public.referral_reward_status_type;

    UPDATE public.payments
    SET escrow_released_at = COALESCE(escrow_released_at, NOW()),
        payment_status = 'released_to_talent'::public.payment_status_type,
        updated_at = NOW()
    WHERE booking_id = v_rec.booking_id
      AND payment_status = 'settled_held'::public.payment_status_type;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.process_escrow_release() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_escrow_release() TO service_role;

-- 4. RPC Server-Side untuk Webhook Payment Gateway (Midtrans / Xendit)
--    Hanya boleh dipanggil dari backend / Edge Function menggunakan service_role.
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
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
     AND NOT public.is_admin() THEN
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

-- 5. Jadwalkan pg_cron jika ekstensi pg_cron aktif di proyek Supabase
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Hapus jadwal lama jika sudah ada agar tidak duplikat
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'yuku_release_escrow_24h') THEN
      PERFORM cron.unschedule('yuku_release_escrow_24h');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'yuku_expire_stale_bookings') THEN
      PERFORM cron.unschedule('yuku_expire_stale_bookings');
    END IF;

    PERFORM cron.schedule(
      'yuku_release_escrow_24h',
      '*/15 * * * *',
      'SELECT public.process_escrow_release();'
    );

    PERFORM cron.schedule(
      'yuku_expire_stale_bookings',
      '*/5 * * * *',
      'SELECT public.expire_stale_booking_reservations();'
    );
  END IF;
END $$;
