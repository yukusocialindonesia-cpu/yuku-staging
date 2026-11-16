-- ============================================================================
-- YUKU — SOCIAL EXPERIENCE & PAID COMPANIONSHIP MARKETPLACE
-- MIGRATION 06: SECURITY REMEDIATION, RLS POLICIES, AUTH TRIGGERS & RPC FUNCTIONS (REVISED VERSION 17)
-- ============================================================================
-- Dokumen Acuan: docs/TAHAP-2-2-FINAL-REMEDIATION-REPORT.md
-- Deskripsi: Menyiapkan 20 helper/RPC SECURITY DEFINER dengan search_path = '',
--            perbaikan trigger KTP (ktp_status_type, verified_at, verified_by_admin_id),
--            RPC admin_review_ktp, trigger handle_new_user di auth.users, proteksi kolom
--            keamanan users (role, is_verified_18, account_status), immutability KTP legal,
--            pembatasan visibilitas talent publik (active & verified_18), auto generate
--            referral_code server-side, 14 Triggers, serta 41 RLS Policies pada 22 Tabel RLS Aktif.
-- ============================================================================

-- 1. ISOLASI PRIVILEGE DEFAULT & HAK AKSES SKEMA
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

-- 2. HELPER FUNCTIONS: SINGLE SOURCE OF TRUTH ROLE & ADMIN CHECK (SECURITY DEFINER with search_path = '')
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS public.user_role_type AS $$
DECLARE
  v_role public.user_role_type;
BEGIN
  IF auth.jwt() IS NOT NULL AND (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN 'admin'::public.user_role_type;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN 'customer'::public.user_role_type;
  END IF;

  -- Kueri langsung ke public.users sebagai satu-satunya sumber kebenaran (Single Source of Truth)
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  RETURN COALESCE(v_role, 'customer'::public.user_role_type);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  IF auth.jwt() IS NOT NULL AND (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN TRUE;
  END IF;
  RETURN public.get_current_user_role() = 'admin'::public.user_role_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 3. HELPER VISIBILITAS PROFIL TALENT PUBLIK (Mencegah Rekursi RLS)
CREATE OR REPLACE FUNCTION public.is_talent_publicly_visible(p_talent_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = p_talent_id 
      AND account_status = 'active'::public.account_status_type 
      AND is_verified_18 = TRUE
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = '';

-- 4. TRIGGER: AUTO GENERATE TALENT REFERRAL CODE SERVER-SIDE
CREATE OR REPLACE FUNCTION public.generate_talent_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL OR NEW.referral_code = '' THEN
    NEW.referral_code := 'YUKU-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_generate_talent_referral_code ON public.talent_profiles;
CREATE TRIGGER trg_generate_talent_referral_code
BEFORE INSERT ON public.talent_profiles
FOR EACH ROW EXECUTE FUNCTION public.generate_talent_referral_code();

-- 5. TRIGGER: HANDLING HANDSHAKE PENDAFTARAN BARU DI AUTH.USERS (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_meta_role TEXT;
  v_final_role public.user_role_type;
BEGIN
  v_meta_role := NEW.raw_user_meta_data ->> 'user_role';
  IF v_meta_role = 'talent' THEN
    v_final_role := 'talent'::public.user_role_type;
  ELSE
    v_final_role := 'customer'::public.user_role_type;
  END IF;

  INSERT INTO public.users (
    id, email, full_name, role, is_verified_18, account_status
  ) VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    v_final_role,
    FALSE,
    'pending_verification'::public.account_status_type
  ) ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. TRIGGER & FUNGSI: PROTEKSI KOLOM KEAMANAN USERS (BLOKIR TAMPERING ID, EMAIL, ROLE, 18+, ACCOUNT STATUS)
CREATE OR REPLACE FUNCTION public.prevent_user_security_column_tampering()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    IF NOT public.is_admin() THEN
      IF NEW.id IS DISTINCT FROM OLD.id OR
         NEW.email IS DISTINCT FROM OLD.email OR
         NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Akses Ditolak: Kolom sistem (id, email, created_at) tidak dapat diubah.';
      END IF;
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'Akses Ditolak: Anda tidak memiliki wewenang untuk mengubah peran pengguna.';
      END IF;
      IF NEW.is_verified_18 IS DISTINCT FROM OLD.is_verified_18 THEN
        RAISE EXCEPTION 'Akses Ditolak: Pengubahan status verifikasi 18+ hanya dapat dilakukan oleh Admin melalui verifikasi KTP resmi.';
      END IF;
      IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
        RAISE EXCEPTION 'Akses Ditolak: Pengubahan status akun hanya dapat dilakukan oleh Admin YUKU.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_prevent_user_security_column_tampering ON public.users;
CREATE TRIGGER trg_prevent_user_security_column_tampering
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_security_column_tampering();

-- 7. TRIGGER & FUNGSI: VALIDASI KELAYAKAN USIA MINIMAL 18 TAHUN DI SERVER
CREATE OR REPLACE FUNCTION public.validate_user_age_18_plus()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.date_of_birth > (CURRENT_DATE - INTERVAL '18 YEARS') THEN
    RAISE EXCEPTION 'Pendaftaran Ditolak: Pengguna YUKU wajib berusia minimal 18 tahun.';
  END IF;

  -- CATATAN KEAMANAN: Memasukkan tanggal lahir BUKAN bukti verifikasi identitas resmi.
  -- is_verified_18 dan account_status HANYA diubah oleh Admin saat KTP terverifikasi!
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_validate_user_age_18_plus ON public.user_identities;
CREATE TRIGGER trg_validate_user_age_18_plus
BEFORE INSERT OR UPDATE ON public.user_identities
FOR EACH ROW EXECUTE FUNCTION public.validate_user_age_18_plus();

-- 8. TRIGGER & FUNGSI: PROTEKSI KTP, ALUR STATUS, & IMMUTABILITY IDENTITAS LEGAL
CREATE OR REPLACE FUNCTION public.protect_and_verify_user_identities()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NOT public.is_admin() THEN
      IF NEW.ktp_number IS NOT NULL AND NEW.ktp_storage_path IS NOT NULL THEN
        NEW.ktp_verification_status := 'pending_review'::public.ktp_status_type;
      ELSE
        NEW.ktp_verification_status := 'unsubmitted'::public.ktp_status_type;
      END IF;
      NEW.ktp_rejection_reason := NULL;
      NEW.verified_at := NULL;
      NEW.verified_by_admin_id := NULL;
    END IF;

  ELSIF (TG_OP = 'UPDATE') THEN
    -- A. Mencegah Self-Approval / Perubahan Status Keputusan Verifikasi KTP oleh Non-Admin
    IF (NEW.ktp_verification_status IS DISTINCT FROM OLD.ktp_verification_status OR 
        NEW.ktp_rejection_reason IS DISTINCT FROM OLD.ktp_rejection_reason OR
        NEW.verified_at IS DISTINCT FROM OLD.verified_at OR
        NEW.verified_by_admin_id IS DISTINCT FROM OLD.verified_by_admin_id) THEN
      IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Akses Ditolak: Status verifikasi KTP dan keputusan admin hanya dapat diperbarui oleh Admin YUKU.';
      END IF;
    END IF;

    -- B. Proteksi Immutability Data Identitas Legal saat Status 'pending_review' atau 'verified'
    IF NOT public.is_admin() AND OLD.ktp_verification_status IN ('pending_review'::public.ktp_status_type, 'verified'::public.ktp_status_type) THEN
      IF NEW.full_legal_name IS DISTINCT FROM OLD.full_legal_name OR
         NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth OR
         NEW.ktp_number IS DISTINCT FROM OLD.ktp_number OR
         NEW.ktp_storage_path IS DISTINCT FROM OLD.ktp_storage_path THEN
        RAISE EXCEPTION 'Akses Ditolak: Data identitas legal yang sedang diproses atau sudah terverifikasi tidak dapat diubah sepihak.';
      END IF;
    END IF;

    -- C. Jika status sebelumnya 'rejected' dan User Mengirim Perbaikan Data, Reset Status ke 'pending_review'
    IF NOT public.is_admin() AND OLD.ktp_verification_status = 'rejected'::public.ktp_status_type THEN
      IF NEW.ktp_number IS DISTINCT FROM OLD.ktp_number OR NEW.ktp_storage_path IS DISTINCT FROM OLD.ktp_storage_path THEN
        NEW.ktp_verification_status := 'pending_review'::public.ktp_status_type;
        NEW.ktp_rejection_reason := NULL;
      END IF;
    END IF;

    -- D. Otomatisasi saat User mengunggah data KTP dari status 'unsubmitted'
    IF NOT public.is_admin() AND OLD.ktp_verification_status = 'unsubmitted'::public.ktp_status_type THEN
      IF NEW.ktp_number IS NOT NULL AND NEW.ktp_storage_path IS NOT NULL THEN
        NEW.ktp_verification_status := 'pending_review'::public.ktp_status_type;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_protect_and_verify_user_identities ON public.user_identities;
CREATE TRIGGER trg_protect_and_verify_user_identities
BEFORE INSERT OR UPDATE ON public.user_identities
FOR EACH ROW EXECUTE FUNCTION public.protect_and_verify_user_identities();

-- 9. RPC FUNCTION: ADMIN REVIEW KTP (SECURITY DEFINER with search_path = '')
CREATE OR REPLACE FUNCTION public.admin_review_ktp(
  p_user_id UUID,
  p_decision public.ktp_status_type,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_status public.ktp_status_type;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses Ditolak: Hanya Admin yang dapat meninjau KTP.';
  END IF;

  IF p_decision NOT IN ('verified'::public.ktp_status_type, 'rejected'::public.ktp_status_type) THEN
    RAISE EXCEPTION 'Keputusan verifikasi KTP hanya boleh verified atau rejected.';
  END IF;

  -- 1. Tolak jika baris user_identities untuk p_user_id tidak ada (dengan penguncian FOR UPDATE untuk mencegah race condition)
  SELECT ktp_verification_status INTO v_current_status
  FROM public.user_identities
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permohonan Ditolak: Data identitas pengguna tidak ditemukan.';
  END IF;

  -- 2. Tolak jika ktp_verification_status saat ini bukan 'pending_review'
  IF v_current_status <> 'pending_review'::public.ktp_status_type THEN
    RAISE EXCEPTION 'Permohonan Ditolak: Verifikasi KTP hanya dapat diproses untuk status pending_review.';
  END IF;

  UPDATE public.user_identities
  SET ktp_verification_status = p_decision,
      ktp_rejection_reason = CASE WHEN p_decision = 'rejected'::public.ktp_status_type THEN p_reason ELSE NULL END,
      verified_at = CASE WHEN p_decision = 'verified'::public.ktp_status_type THEN NOW() ELSE NULL END,
      verified_by_admin_id = CASE WHEN p_decision = 'verified'::public.ktp_status_type THEN auth.uid() ELSE NULL END
  WHERE id = p_user_id;

  IF p_decision = 'verified'::public.ktp_status_type THEN
    UPDATE public.users
    SET is_verified_18 = TRUE,
        account_status = CASE 
          WHEN account_status = 'pending_verification'::public.account_status_type THEN 'active'::public.account_status_type
          ELSE account_status
        END
    WHERE id = p_user_id;
  ELSIF p_decision = 'rejected'::public.ktp_status_type THEN
    UPDATE public.users
    SET is_verified_18 = FALSE
    WHERE id = p_user_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 10. FUNGSI AUTO-EXPIRE RESERVASI SLOT PENDING PAYMENT (15 MENIT)
CREATE OR REPLACE FUNCTION public.expire_stale_booking_reservations()
RETURNS INT AS $$
DECLARE
  v_updated_count INT;
BEGIN
  WITH expired_rows AS (
    UPDATE public.bookings
    SET status = 'expired'::public.booking_status_type,
        cancellation_reason = 'Batas waktu pembayaran 15 menit telah habis'
    WHERE status = 'pending_payment'::public.booking_status_type
      AND payment_expires_at <= NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_updated_count FROM expired_rows;

  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 11. TRIGGER & FUNGSI: SERVER-SIDE PRICING & SLOT PURGE (BIGINT RUPIAH)
CREATE OR REPLACE FUNCTION public.calculate_booking_financials()
RETURNS TRIGGER AS $$
DECLARE
  v_hourly_rate BIGINT;
  v_custom_rate BIGINT;
  v_online_chat_rate BIGINT;
BEGIN
  PERFORM public.expire_stale_booking_reservations();

  SELECT custom_rate_override INTO v_custom_rate
  FROM public.talent_services
  WHERE talent_id = NEW.talent_id AND activity_category_id = NEW.activity_category_id;

  SELECT online_chat_rate INTO v_online_chat_rate
  FROM public.talent_profiles
  WHERE id = NEW.talent_id;

  IF v_custom_rate IS NOT NULL AND v_custom_rate > 0 THEN
    v_hourly_rate := v_custom_rate;
  ELSIF NEW.booking_mode = 'online' AND v_online_chat_rate IS NOT NULL AND v_online_chat_rate > 0 THEN
    v_hourly_rate := v_online_chat_rate;
  ELSE
    SELECT hourly_rate INTO v_hourly_rate
    FROM public.talent_profiles
    WHERE id = NEW.talent_id;
  END IF;

  IF v_hourly_rate IS NULL OR v_hourly_rate <= 0 THEN
    RAISE EXCEPTION 'Tarif Talent tidak valid atau tidak ditemukan.';
  END IF;

  NEW.hourly_rate_snapshot := v_hourly_rate;
  NEW.gross_amount := ROUND(v_hourly_rate * NEW.duration_hours);
  NEW.platform_fee_amount := ROUND(NEW.gross_amount * 0.20); -- 20% YUKU
  NEW.talent_gross_share := NEW.gross_amount - NEW.platform_fee_amount;  -- 80% Talent

  IF NEW.status = 'pending_payment'::public.booking_status_type AND NEW.payment_expires_at IS NULL THEN
    NEW.payment_expires_at := NOW() + INTERVAL '15 MINUTES';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_calculate_booking_financials ON public.bookings;
CREATE TRIGGER trg_calculate_booking_financials
BEFORE INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.calculate_booking_financials();

-- 12. TRIGGER & FUNGSI: STATE MACHINE BOOKING & RESTRIKSI MODIFIKASI JADWAL PASCA-BAYAR
CREATE OR REPLACE FUNCTION public.validate_booking_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.is_admin() THEN
    -- A. Melarang perubahan rincian harga & relasi booking
    IF NEW.hourly_rate_snapshot IS DISTINCT FROM OLD.hourly_rate_snapshot OR
       NEW.gross_amount IS DISTINCT FROM OLD.gross_amount OR
       NEW.platform_fee_amount IS DISTINCT FROM OLD.platform_fee_amount OR
       NEW.talent_gross_share IS DISTINCT FROM OLD.talent_gross_share OR
       NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
       NEW.talent_id IS DISTINCT FROM OLD.talent_id OR
       NEW.activity_category_id IS DISTINCT FROM OLD.activity_category_id THEN
      RAISE EXCEPTION 'Akses Ditolak: Rincian finansial dan relasi booking tidak dapat diubah.';
    END IF;

    -- B. Melarang perubahan jadwal/waktu/lokasi sepihak setelah pembayaran dilakukan
    IF OLD.status IN ('paid_held_in_escrow'::public.booking_status_type, 'confirmed_by_talent'::public.booking_status_type, 'in_progress'::public.booking_status_type, 'completed'::public.booking_status_type) THEN
      IF NEW.start_time IS DISTINCT FROM OLD.start_time OR
         NEW.end_time IS DISTINCT FROM OLD.end_time OR
         NEW.duration_hours IS DISTINCT FROM OLD.duration_hours OR
         NEW.meeting_location_name IS DISTINCT FROM OLD.meeting_location_name OR
         NEW.meeting_location_address IS DISTINCT FROM OLD.meeting_location_address THEN
        RAISE EXCEPTION 'Akses Ditolak: Jadwal dan lokasi booking yang telah dibayar tidak dapat diubah sepihak.';
      END IF;
    END IF;

    -- C. Validasi Transisi State Machine Status Booking
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status = 'pending_payment'::public.booking_status_type AND NEW.status NOT IN ('paid_held_in_escrow'::public.booking_status_type, 'cancelled_by_customer'::public.booking_status_type, 'expired'::public.booking_status_type) THEN
        RAISE EXCEPTION 'Transisi status tidak valid dari % ke %', OLD.status, NEW.status;
      ELSIF OLD.status = 'paid_held_in_escrow'::public.booking_status_type AND NEW.status NOT IN ('confirmed_by_talent'::public.booking_status_type, 'cancelled_by_talent'::public.booking_status_type, 'disputed_hold'::public.booking_status_type, 'refunded'::public.booking_status_type) THEN
        RAISE EXCEPTION 'Transisi status tidak valid dari % ke %', OLD.status, NEW.status;
      ELSIF OLD.status = 'confirmed_by_talent'::public.booking_status_type AND NEW.status NOT IN ('in_progress'::public.booking_status_type, 'cancelled_by_talent'::public.booking_status_type, 'disputed_hold'::public.booking_status_type, 'refunded'::public.booking_status_type) THEN
        RAISE EXCEPTION 'Transisi status tidak valid dari % ke %', OLD.status, NEW.status;
      ELSIF OLD.status = 'in_progress'::public.booking_status_type AND NEW.status NOT IN ('completed'::public.booking_status_type, 'disputed_hold'::public.booking_status_type) THEN
        RAISE EXCEPTION 'Transisi status tidak valid dari % ke %', OLD.status, NEW.status;
      ELSIF OLD.status = 'completed'::public.booking_status_type AND NEW.status NOT IN ('disputed_hold'::public.booking_status_type) THEN
        RAISE EXCEPTION 'Transisi status tidak valid dari % ke %', OLD.status, NEW.status;
      ELSIF OLD.status IN ('refunded'::public.booking_status_type, 'cancelled_by_customer'::public.booking_status_type, 'cancelled_by_talent'::public.booking_status_type, 'expired'::public.booking_status_type) THEN
        RAISE EXCEPTION 'Booking yang sudah selesai/batal tidak dapat diubah statusnya.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_validate_booking_update ON public.bookings;
CREATE TRIGGER trg_validate_booking_update
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.validate_booking_update();

-- 13. TRIGGER & FUNGSI PAYOUT: REF ACTUALLY ATOMIC 2-TAHAP (FK SAFE & CONCURRENCY LOCK)

-- 13A. FUNGSI VALIDASI PAYOUT (BEFORE INSERT ON public.payout_requests)
CREATE OR REPLACE FUNCTION public.validate_payout_request_before_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_available_balance BIGINT;
BEGIN
  -- A. Paksa atribut awal
  NEW.payout_status := 'requested'::public.payout_status_type;
  NEW.processed_by_admin_id := NULL;
  NEW.payout_provider_ref := NULL;
  NEW.provider_confirmed_at := NULL;

  -- B. Validasi batas minimal pencairan Rp100.000
  IF NEW.amount < 100000 THEN
    RAISE EXCEPTION 'Batas minimal pencairan saldo adalah Rp100.000.';
  END IF;

  -- C. Concurrency Lock: Kunci profil talent dengan FOR UPDATE
  PERFORM 1 FROM public.talent_profiles WHERE id = NEW.talent_id FOR UPDATE;

  -- D. Hitung total saldo yang benar-benar tersedia (net_earning - (allocated_payout_amount + paid_out_amount))
  SELECT COALESCE(SUM(net_earning - (allocated_payout_amount + paid_out_amount)), 0) INTO v_available_balance
  FROM (
    SELECT net_earning, allocated_payout_amount, paid_out_amount 
    FROM public.talent_earnings 
    WHERE talent_id = NEW.talent_id 
      AND status IN ('available_for_payout'::public.talent_earning_status_type, 'partially_paid_out'::public.talent_earning_status_type)
      AND (net_earning - (allocated_payout_amount + paid_out_amount)) > 0
    FOR UPDATE
  ) sub;

  IF NEW.amount > v_available_balance THEN
    RAISE EXCEPTION 'Saldo tidak mencukupi untuk pencairan. Saldo tersedia: Rp%. Pencairan diminta: Rp%', v_available_balance, NEW.amount;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_validate_payout_request_before_insert ON public.payout_requests;
CREATE TRIGGER trg_validate_payout_request_before_insert
BEFORE INSERT ON public.payout_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_payout_request_before_insert();

-- 13B. FUNGSI ALOKASI SALDO PAYOUT (AFTER INSERT ON public.payout_requests - FK SAFE)
CREATE OR REPLACE FUNCTION public.allocate_payout_earnings_after_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_remaining_to_allocate BIGINT;
  v_earning RECORD;
  v_unreserved_in_row BIGINT;
  v_alloc_amount BIGINT;
BEGIN
  v_remaining_to_allocate := NEW.amount;

  FOR v_earning IN 
    SELECT id, net_earning, allocated_payout_amount, paid_out_amount 
    FROM public.talent_earnings 
    WHERE talent_id = NEW.talent_id 
      AND status IN ('available_for_payout'::public.talent_earning_status_type, 'partially_paid_out'::public.talent_earning_status_type)
      AND (net_earning - (allocated_payout_amount + paid_out_amount)) > 0
    ORDER BY available_at ASC, created_at ASC
    FOR UPDATE
  LOOP
    IF v_remaining_to_allocate <= 0 THEN
      EXIT;
    END IF;

    v_unreserved_in_row := v_earning.net_earning - (v_earning.allocated_payout_amount + v_earning.paid_out_amount);
    v_alloc_amount := LEAST(v_remaining_to_allocate, v_unreserved_in_row);

    -- Catat alokasi di tabel payout_earnings_allocations (NEW.id sudah valid di tabel payout_requests)
    INSERT INTO public.payout_earnings_allocations (
      payout_request_id, talent_earning_id, allocated_amount, status
    ) VALUES (
      NEW.id, v_earning.id, v_alloc_amount, 'reserved'::public.payout_allocation_status_type
    );

    -- Tambahkan alokasi reservasi pada baris talent_earnings
    UPDATE public.talent_earnings 
    SET allocated_payout_amount = allocated_payout_amount + v_alloc_amount
    WHERE id = v_earning.id;

    v_remaining_to_allocate := v_remaining_to_allocate - v_alloc_amount;
  END LOOP;

  IF v_remaining_to_allocate > 0 THEN
    RAISE EXCEPTION 'Gagal mengalokasikan saldo payout secara penuh. Sisa alokasi yang belum tercover: Rp%', v_remaining_to_allocate;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_allocate_payout_earnings_after_insert ON public.payout_requests;
CREATE TRIGGER trg_allocate_payout_earnings_after_insert
AFTER INSERT ON public.payout_requests
FOR EACH ROW EXECUTE FUNCTION public.allocate_payout_earnings_after_insert();

-- 13C. FUNGSI HANDLER PERUBAHAN STATUS PAYOUT (BEFORE/AFTER UPDATE ON public.payout_requests)
CREATE OR REPLACE FUNCTION public.handle_payout_status_update()
RETURNS TRIGGER AS $$
DECLARE
  v_alloc_rec RECORD;
  v_new_paid_out BIGINT;
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.payout_status IS DISTINCT FROM OLD.payout_status OR
       NEW.payout_provider_ref IS DISTINCT FROM OLD.payout_provider_ref OR
       NEW.processed_by_admin_id IS DISTINCT FROM OLD.processed_by_admin_id THEN
      RAISE EXCEPTION 'Akses Ditolak: Status pencairan hanya dapat diproses oleh Admin / Provider Callback.';
    END IF;
  END IF;

  -- Idempotency & Reversal Status Payout saat Rejected/Failed atau Completed
  IF NEW.payout_status IS DISTINCT FROM OLD.payout_status THEN
    IF NEW.payout_status IN ('rejected'::public.payout_status_type, 'failed'::public.payout_status_type) THEN
      -- Bebaskan alokasi reservasi yang pending secara atomik
      FOR v_alloc_rec IN 
        SELECT id, talent_earning_id, allocated_amount 
        FROM public.payout_earnings_allocations 
        WHERE payout_request_id = NEW.id AND status = 'reserved'::public.payout_allocation_status_type
        FOR UPDATE
      LOOP
        UPDATE public.talent_earnings
        SET allocated_payout_amount = GREATEST(0, allocated_payout_amount - v_alloc_rec.allocated_amount)
        WHERE id = v_alloc_rec.talent_earning_id;

        UPDATE public.payout_earnings_allocations
        SET status = 'released_unreserved'::public.payout_allocation_status_type
        WHERE id = v_alloc_rec.id;
      END LOOP;

    ELSIF NEW.payout_status = 'completed_provider_confirmed'::public.payout_status_type THEN
      -- Selesaikan alokasi reservasi & perbarui paid_out_amount
      FOR v_alloc_rec IN 
        SELECT id, talent_earning_id, allocated_amount 
        FROM public.payout_earnings_allocations 
        WHERE payout_request_id = NEW.id AND status = 'reserved'::public.payout_allocation_status_type
        FOR UPDATE
      LOOP
        SELECT (paid_out_amount + v_alloc_rec.allocated_amount) INTO v_new_paid_out
        FROM public.talent_earnings WHERE id = v_alloc_rec.talent_earning_id;

        UPDATE public.talent_earnings
        SET allocated_payout_amount = GREATEST(0, allocated_payout_amount - v_alloc_rec.allocated_amount),
            paid_out_amount = paid_out_amount + v_alloc_rec.allocated_amount,
            status = CASE 
              WHEN (paid_out_amount + v_alloc_rec.allocated_amount) >= net_earning THEN 'fully_paid_out'::public.talent_earning_status_type
              ELSE 'partially_paid_out'::public.talent_earning_status_type
            END
        WHERE id = v_alloc_rec.talent_earning_id;

        UPDATE public.payout_earnings_allocations
        SET status = 'settled'::public.payout_allocation_status_type
        WHERE id = v_alloc_rec.id;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_handle_payout_status_update ON public.payout_requests;
CREATE TRIGGER trg_handle_payout_status_update
BEFORE UPDATE ON public.payout_requests
FOR EACH ROW EXECUTE FUNCTION public.handle_payout_status_update();

-- 14. TRIGGER & FUNGSI: VALIDASI & IMMUTABILITY REFERRAL RELATIONSHIP
CREATE OR REPLACE FUNCTION public.validate_referral_relationship()
RETURNS TRIGGER AS $$
DECLARE
  v_referrer_user_id UUID;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    SELECT id INTO v_referrer_user_id
    FROM public.talent_profiles
    WHERE referral_code = NEW.referral_code_used;

    IF v_referrer_user_id IS NULL THEN
      RAISE EXCEPTION 'Kode referral % tidak ditemukan.', NEW.referral_code_used;
    END IF;

    IF v_referrer_user_id = NEW.referee_talent_id THEN
      RAISE EXCEPTION 'Self-referral dilarang.';
    END IF;

    NEW.referrer_id := v_referrer_user_id;

  ELSIF (TG_OP = 'UPDATE') THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Relasi referral bersifat permanen dan tidak dapat diubah.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_validate_referral_relationship ON public.referral_relationships;
CREATE TRIGGER trg_validate_referral_relationship
BEFORE INSERT OR UPDATE ON public.referral_relationships
FOR EACH ROW EXECUTE FUNCTION public.validate_referral_relationship();

-- 15. TRIGGER & FUNGSI: LEDGER IDEMPOTENCY & AUTO GENERATION (PAYMENT SETTLED)
CREATE OR REPLACE FUNCTION public.auto_generate_booking_financial_ledgers()
RETURNS TRIGGER AS $$
DECLARE
  v_booking RECORD;
  v_referral_rel RECORD;
  v_referral_reward_amount BIGINT;
BEGIN
  IF (NEW.payment_status = 'settled_held'::public.payment_status_type AND (OLD.payment_status IS NULL OR OLD.payment_status = 'pending'::public.payment_status_type)) THEN
    SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
    
    IF v_booking IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.commission_records WHERE booking_id = v_booking.id) THEN
        RETURN NEW;
      END IF;

      SELECT * INTO v_referral_rel 
      FROM public.referral_relationships 
      WHERE referee_talent_id = v_booking.talent_id AND is_active = TRUE;

      IF v_referral_rel IS NOT NULL THEN
        -- Reward referral = 10% dari komisi 20% YUKU (Integer Rupiah)
        v_referral_reward_amount := ROUND(v_booking.platform_fee_amount * 0.10);
      ELSE
        v_referral_reward_amount := 0;
      END IF;

      INSERT INTO public.commission_records (
        booking_id, gross_booking_amount, platform_commission_amount,
        talent_gross_share, referral_payout_reserved, net_platform_revenue
      ) VALUES (
        v_booking.id, v_booking.gross_amount, v_booking.platform_fee_amount,
        v_booking.talent_gross_share, v_referral_reward_amount,
        v_booking.platform_fee_amount - v_referral_reward_amount
      ) ON CONFLICT (booking_id) DO NOTHING;

      INSERT INTO public.talent_earnings (
        talent_id, booking_id, gross_earning, tax_withheld, transfer_fee, net_earning, status, entry_type
      ) VALUES (
        v_booking.talent_id, v_booking.id, v_booking.talent_gross_share, 0, 0,
        v_booking.talent_gross_share, 'held_in_escrow'::public.talent_earning_status_type, 'earning'::public.ledger_entry_type
      ) ON CONFLICT (booking_id) DO NOTHING;

      IF v_referral_rel IS NOT NULL AND v_referral_reward_amount > 0 THEN
        INSERT INTO public.referral_rewards (
          referral_relationship_id, booking_id, referrer_id, platform_commission_base, reward_amount, status
        ) VALUES (
          v_referral_rel.id, v_booking.id, v_referral_rel.referrer_id,
          v_booking.platform_fee_amount, v_referral_reward_amount, 'pending_completion'::public.referral_reward_status_type
        ) ON CONFLICT (booking_id) DO NOTHING;
      END IF;

    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_auto_generate_booking_financial_ledgers ON public.payments;
CREATE TRIGGER trg_auto_generate_booking_financial_ledgers
AFTER UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.auto_generate_booking_financial_ledgers();

-- 16. FUNGSI PELEPASAN ESCROW 24 JAM AMAN MULTI-WORKER (FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.process_escrow_release()
RETURNS INT AS $$
DECLARE
  v_count INT := 0;
  v_rec RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses Ditolak: Fungsi pelepasan escrow hanya dapat dijalankan oleh backend terpercaya / service_role.';
  END IF;

  FOR v_rec IN 
    SELECT b.id AS booking_id, b.talent_id
    FROM public.bookings b
    WHERE b.status = 'completed'::public.booking_status_type
      AND b.completion_confirmed_at <= (NOW() - INTERVAL '24 HOURS')
      AND NOT EXISTS (
        SELECT 1 FROM public.reports_complaints rc 
        WHERE rc.booking_id = b.id AND rc.status IN ('open'::public.report_status_type, 'investigating'::public.report_status_type)
      )
    FOR UPDATE OF b SKIP LOCKED -- Multi-worker concurrency lock
  LOOP
    UPDATE public.talent_earnings
    SET status = 'available_for_payout'::public.talent_earning_status_type,
        available_at = NOW()
    WHERE booking_id = v_rec.booking_id AND status = 'held_in_escrow'::public.talent_earning_status_type;

    UPDATE public.referral_rewards
    SET status = 'credited'::public.referral_reward_status_type,
        credited_at = NOW()
    WHERE booking_id = v_rec.booking_id AND status = 'pending_completion'::public.referral_reward_status_type;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 17. TRIGGER & FUNGSI: REFUND REVERSAL IDEMPOTENT & DISPUTE HOLD HANDLING
CREATE OR REPLACE FUNCTION public.handle_booking_refund_financials()
RETURNS TRIGGER AS $$
DECLARE
  v_earning RECORD;
BEGIN
  IF NEW.status = 'disputed_hold'::public.booking_status_type THEN
    UPDATE public.talent_earnings
    SET status = 'disputed_hold'::public.talent_earning_status_type
    WHERE booking_id = NEW.id;

    UPDATE public.referral_rewards
    SET status = 'pending_completion'::public.referral_reward_status_type
    WHERE booking_id = NEW.id;

  ELSIF NEW.status IN ('refunded'::public.booking_status_type, 'cancelled_by_customer'::public.booking_status_type, 'cancelled_by_talent'::public.booking_status_type) THEN
    IF EXISTS (SELECT 1 FROM public.financial_adjustments_reversals WHERE booking_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    SELECT * INTO v_earning FROM public.talent_earnings WHERE booking_id = NEW.id;

    IF v_earning IS NOT NULL AND v_earning.status <> 'refund_adjusted'::public.talent_earning_status_type THEN
      UPDATE public.talent_earnings
      SET status = 'refund_adjusted'::public.talent_earning_status_type
      WHERE id = v_earning.id;

      INSERT INTO public.financial_adjustments_reversals (
        booking_id, talent_id, original_talent_earning_id, reversal_amount, reason
      ) VALUES (
        NEW.id, NEW.talent_id, v_earning.id, v_earning.net_earning,
        CONCAT('Reversal akibat status booking berubah menjadi: ', NEW.status)
      );

      UPDATE public.referral_rewards
      SET status = 'cancelled_disputed'::public.referral_reward_status_type
      WHERE booking_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_handle_booking_refund_financials ON public.bookings;
CREATE TRIGGER trg_handle_booking_refund_financials
AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.handle_booking_refund_financials();

-- 18. TRIGGER & FUNGSI: RESTRIKSI PEMBAHARUAN NOTIFIKASI
CREATE OR REPLACE FUNCTION public.restrict_notification_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.title IS DISTINCT FROM OLD.title OR
       NEW.message IS DISTINCT FROM OLD.message OR
       NEW.type IS DISTINCT FROM OLD.type OR
       NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Akses Ditolak: Pengguna hanya dapat mengubah status is_read pada notifikasi.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS trg_restrict_notification_update ON public.notifications;
CREATE TRIGGER trg_restrict_notification_update
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.restrict_notification_update();

-- 19. MANAJEMEN HAK EXECUTE SECURITY DEFINER (EKSPLISIT REVOKE & MINIMAL GRANT)
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_talent_publicly_visible(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_ktp(UUID, public.ktp_status_type, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_escrow_release() TO service_role;

-- 20. TABLE & COLUMN LEVEL PRIVILEGES (MINIMAL GRANTS)
GRANT SELECT ON public.activity_categories TO anon, authenticated;
GRANT SELECT ON public.talent_profiles TO anon, authenticated;
GRANT SELECT ON public.talent_services TO anon, authenticated;
GRANT SELECT ON public.talent_availability TO anon, authenticated;
GRANT SELECT ON public.reviews TO anon, authenticated;

GRANT SELECT ON public.users TO authenticated;
GRANT UPDATE (full_name, phone_number, updated_at) ON public.users TO authenticated;

GRANT SELECT ON public.user_identities TO authenticated;
GRANT INSERT (id, full_legal_name, date_of_birth, ktp_number, ktp_storage_path, emergency_contact_phone) ON public.user_identities TO authenticated;
GRANT UPDATE (full_legal_name, date_of_birth, ktp_number, ktp_storage_path, emergency_contact_phone, updated_at) ON public.user_identities TO authenticated;

GRANT SELECT ON public.customer_profiles TO authenticated;
GRANT INSERT (id, display_name, avatar_url, city, gender, bio) ON public.customer_profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url, city, gender, bio, updated_at) ON public.customer_profiles TO authenticated;

GRANT INSERT (id, display_name, avatar_url, city, gender, headline, bio, hourly_rate, online_chat_rate, service_mode, languages, interests) ON public.talent_profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url, city, gender, headline, bio, hourly_rate, online_chat_rate, service_mode, languages, interests, updated_at) ON public.talent_profiles TO authenticated;

-- 21. PENGAKTIFAN ROW LEVEL SECURITY (RLS) PADA 22 TABEL
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_earnings_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_adjustments_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- 22. DDL RLS POLICIES LENGKAP & AMAN (22 Tabel - 41 Policies)

-- 1. users
DROP POLICY IF EXISTS "users_select_self_or_admin" ON public.users;
CREATE POLICY "users_select_self_or_admin" ON public.users
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "users_update_self_or_admin" ON public.users;
CREATE POLICY "users_update_self_or_admin" ON public.users
  FOR UPDATE USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- 2. user_identities (TABEL PRIVAT TERISOLASI KTP & LEGAL DATA)
DROP POLICY IF EXISTS "user_identities_owner_or_admin_select" ON public.user_identities;
CREATE POLICY "user_identities_owner_or_admin_select" ON public.user_identities
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "user_identities_owner_insert" ON public.user_identities;
CREATE POLICY "user_identities_owner_insert" ON public.user_identities
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "user_identities_owner_or_admin_update" ON public.user_identities;
CREATE POLICY "user_identities_owner_or_admin_update" ON public.user_identities
  FOR UPDATE USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- 3. customer_profiles
DROP POLICY IF EXISTS "customer_profiles_select" ON public.customer_profiles;
CREATE POLICY "customer_profiles_select" ON public.customer_profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin() OR EXISTS (SELECT 1 FROM public.bookings WHERE customer_id = public.customer_profiles.id AND talent_id = auth.uid()));

DROP POLICY IF EXISTS "customer_profiles_insert" ON public.customer_profiles;
CREATE POLICY "customer_profiles_insert" ON public.customer_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "customer_profiles_update" ON public.customer_profiles;
CREATE POLICY "customer_profiles_update" ON public.customer_profiles
  FOR UPDATE USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- 4. talent_profiles
DROP POLICY IF EXISTS "talent_profiles_select_public" ON public.talent_profiles;
CREATE POLICY "talent_profiles_select_public" ON public.talent_profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin() OR public.is_talent_publicly_visible(id));

DROP POLICY IF EXISTS "talent_profiles_insert_self" ON public.talent_profiles;
CREATE POLICY "talent_profiles_insert_self" ON public.talent_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "talent_profiles_update_self_or_admin" ON public.talent_profiles;
CREATE POLICY "talent_profiles_update_self_or_admin" ON public.talent_profiles
  FOR UPDATE USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());

-- 5. activity_categories
DROP POLICY IF EXISTS "activity_categories_select_public" ON public.activity_categories;
CREATE POLICY "activity_categories_select_public" ON public.activity_categories
  FOR SELECT USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "activity_categories_admin_all" ON public.activity_categories;
CREATE POLICY "activity_categories_admin_all" ON public.activity_categories
  FOR ALL USING (public.is_admin());

-- 6. talent_services
DROP POLICY IF EXISTS "talent_services_select_public" ON public.talent_services;
CREATE POLICY "talent_services_select_public" ON public.talent_services
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "talent_services_owner_all" ON public.talent_services;
CREATE POLICY "talent_services_owner_all" ON public.talent_services
  FOR ALL USING (auth.uid() = talent_id OR public.is_admin());

-- 7. talent_availability
DROP POLICY IF EXISTS "talent_availability_select_public" ON public.talent_availability;
CREATE POLICY "talent_availability_select_public" ON public.talent_availability
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "talent_availability_owner_all" ON public.talent_availability;
CREATE POLICY "talent_availability_owner_all" ON public.talent_availability
  FOR ALL USING (auth.uid() = talent_id OR public.is_admin());

-- 8. bookings
DROP POLICY IF EXISTS "bookings_select_parties_or_admin" ON public.bookings;
CREATE POLICY "bookings_select_parties_or_admin" ON public.bookings
  FOR SELECT USING (auth.uid() = customer_id OR auth.uid() = talent_id OR public.is_admin());

DROP POLICY IF EXISTS "bookings_insert_customer" ON public.bookings;
CREATE POLICY "bookings_insert_customer" ON public.bookings
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "bookings_update_parties_or_admin" ON public.bookings;
CREATE POLICY "bookings_update_parties_or_admin" ON public.bookings
  FOR UPDATE USING (auth.uid() = customer_id OR auth.uid() = talent_id OR public.is_admin());

-- 9. booking_status_history
DROP POLICY IF EXISTS "status_history_select_parties_or_admin" ON public.booking_status_history;
CREATE POLICY "status_history_select_parties_or_admin" ON public.booking_status_history
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND (b.customer_id = auth.uid() OR b.talent_id = auth.uid())) OR public.is_admin());

DROP POLICY IF EXISTS "status_history_insert_authenticated" ON public.booking_status_history;
CREATE POLICY "status_history_insert_authenticated" ON public.booking_status_history
  FOR INSERT WITH CHECK (auth.uid() = changed_by_user_id);

-- 10. payments
DROP POLICY IF EXISTS "payments_select_parties_or_admin" ON public.payments;
CREATE POLICY "payments_select_parties_or_admin" ON public.payments
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_id AND (b.customer_id = auth.uid() OR b.talent_id = auth.uid())) OR public.is_admin());

-- 11. refunds
DROP POLICY IF EXISTS "refunds_select_customer_or_admin" ON public.refunds;
CREATE POLICY "refunds_select_customer_or_admin" ON public.refunds
  FOR SELECT USING (auth.uid() = customer_id OR public.is_admin());

DROP POLICY IF EXISTS "refunds_insert_customer" ON public.refunds;
CREATE POLICY "refunds_insert_customer" ON public.refunds
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

-- 12. commission_records
DROP POLICY IF EXISTS "commission_records_admin_only" ON public.commission_records;
CREATE POLICY "commission_records_admin_only" ON public.commission_records
  FOR ALL USING (public.is_admin());

-- 13. talent_earnings
DROP POLICY IF EXISTS "talent_earnings_select_talent_or_admin" ON public.talent_earnings;
CREATE POLICY "talent_earnings_select_talent_or_admin" ON public.talent_earnings
  FOR SELECT USING (auth.uid() = talent_id OR public.is_admin());

-- 14. payout_earnings_allocations
DROP POLICY IF EXISTS "payout_earnings_alloc_talent_or_admin" ON public.payout_earnings_allocations;
CREATE POLICY "payout_earnings_alloc_talent_or_admin" ON public.payout_earnings_allocations
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.payout_requests pr WHERE pr.id = payout_request_id AND pr.talent_id = auth.uid()) OR public.is_admin());

-- 15. referral_relationships
DROP POLICY IF EXISTS "referral_relationships_select_parties" ON public.referral_relationships;
CREATE POLICY "referral_relationships_select_parties" ON public.referral_relationships
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referee_talent_id OR public.is_admin());

DROP POLICY IF EXISTS "referral_relationships_insert_talent" ON public.referral_relationships;
CREATE POLICY "referral_relationships_insert_talent" ON public.referral_relationships
  FOR INSERT WITH CHECK (auth.uid() = referee_talent_id);

-- 16. referral_rewards
DROP POLICY IF EXISTS "referral_rewards_select_referrer_or_admin" ON public.referral_rewards;
CREATE POLICY "referral_rewards_select_referrer_or_admin" ON public.referral_rewards
  FOR SELECT USING (auth.uid() = referrer_id OR public.is_admin());

-- 17. payout_requests
DROP POLICY IF EXISTS "payout_requests_select_talent_or_admin" ON public.payout_requests;
CREATE POLICY "payout_requests_select_talent_or_admin" ON public.payout_requests
  FOR SELECT USING (auth.uid() = talent_id OR public.is_admin());

DROP POLICY IF EXISTS "payout_requests_insert_talent" ON public.payout_requests;
CREATE POLICY "payout_requests_insert_talent" ON public.payout_requests
  FOR INSERT WITH CHECK (auth.uid() = talent_id);

-- 18. financial_adjustments_reversals
DROP POLICY IF EXISTS "financial_adjustments_admin_only" ON public.financial_adjustments_reversals;
CREATE POLICY "financial_adjustments_admin_only" ON public.financial_adjustments_reversals
  FOR ALL USING (public.is_admin());

-- 19. reviews
DROP POLICY IF EXISTS "reviews_select_public" ON public.reviews;
CREATE POLICY "reviews_select_public" ON public.reviews
  FOR SELECT USING (is_visible = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "reviews_insert_customer" ON public.reviews;
CREATE POLICY "reviews_insert_customer" ON public.reviews
  FOR INSERT WITH CHECK (auth.uid() = customer_id);

-- 20. reports_complaints
DROP POLICY IF EXISTS "reports_select_reporter_or_admin" ON public.reports_complaints;
CREATE POLICY "reports_select_reporter_or_admin" ON public.reports_complaints
  FOR SELECT USING (auth.uid() = reporter_id OR public.is_admin());

DROP POLICY IF EXISTS "reports_insert_user" ON public.reports_complaints;
CREATE POLICY "reports_insert_user" ON public.reports_complaints
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- 21. notifications
DROP POLICY IF EXISTS "notifications_select_user" ON public.notifications;
CREATE POLICY "notifications_select_user" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "notifications_update_user" ON public.notifications;
CREATE POLICY "notifications_update_user" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- 23. SUPABASE STORAGE BUCKETS & RLS POLICIES (TAHAP B SECURITY HARDENING)
DO $$ BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES 
    ('ktp-documents', 'ktp-documents', FALSE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
    ('avatars', 'avatars', TRUE, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp']),
    ('portfolios', 'portfolios', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Storage Policies untuk ktp-documents (Private Bucket - Hanya Pemilik & Admin)
DROP POLICY IF EXISTS "ktp_documents_owner_insert" ON storage.objects;
CREATE POLICY "ktp_documents_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'ktp-documents' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "ktp_documents_owner_or_admin_select" ON storage.objects;
CREATE POLICY "ktp_documents_owner_or_admin_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'ktp-documents' AND (
      auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin()
    )
  );

-- Storage Policies untuk avatars (Public Bucket)
DROP POLICY IF EXISTS "avatars_public_select" ON storage.objects;
CREATE POLICY "avatars_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
CREATE POLICY "avatars_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage Policies untuk portfolios (Public Bucket)
DROP POLICY IF EXISTS "portfolios_public_select" ON storage.objects;
CREATE POLICY "portfolios_public_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'portfolios');

DROP POLICY IF EXISTS "portfolios_owner_insert" ON storage.objects;
CREATE POLICY "portfolios_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'portfolios' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "portfolios_owner_update" ON storage.objects;
CREATE POLICY "portfolios_owner_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'portfolios' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- PROSEDUR ROLLBACK MIGRASI 06
-- ============================================================================
/*
  DROP TRIGGER IF EXISTS trg_restrict_notification_update ON public.notifications;
  DROP TRIGGER IF EXISTS trg_handle_booking_refund_financials ON public.bookings;
  DROP TRIGGER IF EXISTS trg_auto_generate_booking_financial_ledgers ON public.payments;
  DROP TRIGGER IF EXISTS trg_validate_referral_relationship ON public.referral_relationships;
  DROP TRIGGER IF EXISTS trg_handle_payout_status_update ON public.payout_requests;
  DROP TRIGGER IF EXISTS trg_allocate_payout_earnings_after_insert ON public.payout_requests;
  DROP TRIGGER IF EXISTS trg_validate_payout_request_before_insert ON public.payout_requests;
  DROP TRIGGER IF EXISTS trg_validate_booking_update ON public.bookings;
  DROP TRIGGER IF EXISTS trg_calculate_booking_financials ON public.bookings;
  DROP TRIGGER IF EXISTS trg_protect_and_verify_user_identities ON public.user_identities;
  DROP TRIGGER IF EXISTS trg_validate_user_age_18_plus ON public.user_identities;
  DROP TRIGGER IF EXISTS trg_prevent_user_security_column_tampering ON public.users;
  DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
  DROP TRIGGER IF EXISTS trg_generate_talent_referral_code ON public.talent_profiles;
  DROP FUNCTION IF EXISTS public.restrict_notification_update(), public.handle_booking_refund_financials(), public.process_escrow_release(), public.auto_generate_booking_financial_ledgers(), public.validate_referral_relationship(), public.handle_payout_status_update(), public.allocate_payout_earnings_after_insert(), public.validate_payout_request_before_insert(), public.validate_booking_update(), public.calculate_booking_financials(), public.expire_stale_booking_reservations(), public.admin_review_ktp(UUID, public.ktp_status_type, TEXT), public.protect_and_verify_user_identities(), public.validate_user_age_18_plus(), public.prevent_user_security_column_tampering(), public.handle_new_user(), public.generate_talent_referral_code(), public.is_talent_publicly_visible(UUID), public.is_admin(), public.get_current_user_role();
*/
