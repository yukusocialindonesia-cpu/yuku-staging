-- ============================================================================
-- YUKU MIGRATION 08: GRANT ADDITIONAL POSTGRESQL PRIVILEGES & AUTO-PROFILE TRIGGER
-- Deskripsi: Memberikan hak akses tabel (GRANT) untuk fitur-fitur transaksi lanjutan
--            (Reviews, Reports, Notifications, Talent Availability, Payouts, Earnings,
--            Payments, Refunds, Referrals) pasca-REVOKE ALL di Migrasi 06,
--            serta menyempurnakan handle_new_user() agar otomatis menginisialisasi
--            customer_profiles demi mencegah foreign key race condition pada booking.
-- ============================================================================

-- 1. ULASAN & RATING (public.reviews)
-- RLS Policy: reviews_select_public, reviews_insert_customer
GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT INSERT (booking_id, customer_id, talent_id, rating, review_text) ON public.reviews TO authenticated;

-- 2. LAPORAN & KOMPLAIN (public.reports_complaints)
-- RLS Policy: reports_insert_user, reports_select_reporter_or_admin
GRANT SELECT, INSERT ON public.reports_complaints TO authenticated;

-- 3. NOTIFIKASI PENGGUNA (public.notifications)
-- RLS Policy: notifications_select_user, notifications_update_user
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (is_read, updated_at) ON public.notifications TO authenticated;

-- 4. KETERSEDIAAN / JADWAL TALENT (public.talent_availability)
-- RLS Policy: availability_select_public_or_authenticated, availability_manage_talent
GRANT SELECT ON public.talent_availability TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.talent_availability TO authenticated;

-- 5. PENARIKAN SALDO TALENT (public.payout_requests)
-- RLS Policy: payout_requests_select_talent_or_admin, payout_requests_insert_talent
GRANT SELECT ON public.payout_requests TO authenticated;
GRANT INSERT (payout_number, talent_id, amount, bank_name, bank_account_number, bank_account_holder_name, payout_provider, payout_status) ON public.payout_requests TO authenticated;

-- 6. PENDAPATAN TALENT (public.talent_earnings)
-- RLS Policy: talent_earnings_select_talent_or_admin
GRANT SELECT ON public.talent_earnings TO authenticated;

-- 7. PEMBAYARAN (public.payments)
-- RLS Policy: payments_select_parties_or_admin
GRANT SELECT ON public.payments TO authenticated;

-- 8. PENGEMBALIAN DANA (public.refunds)
-- RLS Policy: refunds_select_customer_or_admin, refunds_insert_customer
GRANT SELECT ON public.refunds TO authenticated;
GRANT INSERT (payment_id, customer_id, reason, refund_amount) ON public.refunds TO authenticated;

-- 9. PROGRAM REFERRAL (public.referral_relationships & public.referral_rewards)
-- RLS Policy: referral_relationships_select_parties, referral_relationships_insert_talent
GRANT SELECT ON public.referral_relationships TO authenticated;
GRANT INSERT (referring_talent_id, referred_talent_id) ON public.referral_relationships TO authenticated;
GRANT SELECT ON public.referral_rewards TO authenticated;

-- 10. KOLOM VERIFIKASI IDENTITAS LEGAL (public.user_identities)
-- Memberikan izin kolom ktp_verification_status untuk inisialisasi awal oleh authenticated
GRANT INSERT (ktp_verification_status) ON public.user_identities TO authenticated;

-- 11. ENHANCE handle_new_user(): OTOMATIS INISIALISASI customer_profiles
-- Memastikan relasi foreign key bookings.customer_id -> customer_profiles(id) selalu terpenuhi
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_meta_role TEXT;
  v_final_role public.user_role_type;
  v_display_name TEXT;
BEGIN
  v_meta_role := NEW.raw_user_meta_data ->> 'user_role';
  IF v_meta_role = 'talent' THEN
    v_final_role := 'talent'::public.user_role_type;
  ELSE
    v_final_role := 'customer'::public.user_role_type;
  END IF;

  v_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
    split_part(NEW.email, '@', 1),
    'Pengguna YUKU'
  );

  -- 1. Simpan ke public.users
  INSERT INTO public.users (
    id, email, full_name, role, is_verified_18, account_status
  ) VALUES (
    NEW.id,
    NEW.email,
    v_display_name,
    v_final_role,
    FALSE,
    'pending_verification'::public.account_status_type
  ) ON CONFLICT (id) DO NOTHING;

  -- 2. Otomatis buat entri profil customer jika belum ada
  INSERT INTO public.customer_profiles (
    id, display_name, city, gender, bio
  ) VALUES (
    NEW.id,
    v_display_name,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'city'), ''), 'Jakarta'),
    'Wanita'::public.gender_type,
    'Pengguna Komunitas YUKU'
  ) ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Pastikan trigger terpasang pada auth.users
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
