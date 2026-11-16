-- ============================================================================
-- YUKU MIGRATION 09: ADMIN MANAGEMENT RPCS & CURATION LOGIC
-- Deskripsi: Fungsi-fungsi resmi bagi tim kurasi dan admin YUKU untuk:
--            1. Menyetujui atau menolak profil Talent & e-KTP 18+ (admin_review_talent)
--            2. Memproses pencairan saldo penghasilan Talent (admin_process_payout)
--            3. Mengambil agregasi metrik finansial & transaksi platform (get_admin_dashboard_overview)
--            4. (DIHAPUS) Jalur admin via email/metadata signup ditutup; gunakan provision_admin_user()
-- ============================================================================

-- 1. PEMBARUAN handle_new_user(): hanya 'talent' atau 'customer' dari signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_meta_role TEXT;
  v_final_role public.user_role_type;
  v_display_name TEXT;
BEGIN
  v_meta_role := NEW.raw_user_meta_data ->> 'user_role';

  -- Admin TIDAK PERNAH diberikan lewat signup (email/metadata). Gunakan provision_admin_user().
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
    (CASE WHEN v_final_role = 'admin'::public.user_role_type THEN TRUE ELSE FALSE END),
    (CASE WHEN v_final_role = 'admin'::public.user_role_type THEN 'active'::public.account_status_type ELSE 'pending_verification'::public.account_status_type END)
  ) ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    is_verified_18 = (CASE WHEN EXCLUDED.role = 'admin'::public.user_role_type THEN TRUE ELSE public.users.is_verified_18 END),
    account_status = (CASE WHEN EXCLUDED.role = 'admin'::public.user_role_type THEN 'active'::public.account_status_type ELSE public.users.account_status END);

  -- 2. Otomatis buat entri profil customer
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

-- 2. RPC: admin_review_talent
-- Menyetujui atau menolak profil Talent dan verifikasi KTP dalam satu transaksi atomik
CREATE OR REPLACE FUNCTION public.admin_review_talent(
  p_talent_id UUID,
  p_is_approved BOOLEAN,
  p_ktp_status public.ktp_status_type,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses Ditolak: Hanya Admin YUKU yang berhak mengubah status kurasi Talent.';
  END IF;

  -- 1. Update status publik di talent_profiles
  UPDATE public.talent_profiles
  SET is_approved = p_is_approved,
      updated_at = NOW()
  WHERE id = p_talent_id;

  -- 2. Update status verifikasi KTP di user_identities jika ada
  UPDATE public.user_identities
  SET ktp_verification_status = p_ktp_status,
      ktp_rejection_reason = (CASE WHEN p_ktp_status = 'rejected'::public.ktp_status_type THEN p_notes ELSE NULL END),
      verified_at = (CASE WHEN p_ktp_status = 'verified'::public.ktp_status_type THEN NOW() ELSE NULL END),
      verified_by_admin_id = (CASE WHEN p_ktp_status = 'verified'::public.ktp_status_type THEN auth.uid() ELSE NULL END),
      updated_at = NOW()
  WHERE id = p_talent_id;

  -- 3. Update status akun di public.users
  UPDATE public.users
  SET is_verified_18 = (CASE WHEN p_ktp_status = 'verified'::public.ktp_status_type THEN TRUE ELSE FALSE END),
      account_status = (CASE WHEN p_is_approved THEN 'active'::public.account_status_type ELSE 'pending_verification'::public.account_status_type END),
      updated_at = NOW()
  WHERE id = p_talent_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

GRANT EXECUTE ON FUNCTION public.admin_review_talent TO authenticated;

-- 3. RPC: admin_process_payout
-- Memproses permohonan pencairan saldo (requested -> processing / paid / rejected)
CREATE OR REPLACE FUNCTION public.admin_process_payout(
  p_payout_id UUID,
  p_new_status public.payout_status_type,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses Ditolak: Hanya Admin YUKU yang berhak memproses pencairan dana.';
  END IF;

  UPDATE public.payout_requests
  SET payout_status = p_new_status,
      rejection_reason = (CASE WHEN p_new_status = 'rejected'::public.payout_status_type THEN p_rejection_reason ELSE NULL END),
      processed_by_admin_id = auth.uid(),
      provider_confirmed_at = (CASE WHEN p_new_status = 'paid'::public.payout_status_type THEN NOW() ELSE NULL END)
  WHERE id = p_payout_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

GRANT EXECUTE ON FUNCTION public.admin_process_payout TO authenticated;

-- 4. RPC: get_admin_dashboard_overview
-- Mengambil ringkasan data platform untuk tampilan Panel Admin
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_overview()
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses Ditolak: Anda tidak memiliki akses ke metrik Admin YUKU.';
  END IF;

  SELECT jsonb_build_object(
    'total_talents', (SELECT COUNT(*) FROM public.talent_profiles),
    'approved_talents', (SELECT COUNT(*) FROM public.talent_profiles WHERE is_approved = TRUE),
    'pending_talents', (SELECT COUNT(*) FROM public.talent_profiles WHERE is_approved = FALSE),
    'total_customers', (SELECT COUNT(*) FROM public.customer_profiles),
    'total_bookings', (SELECT COUNT(*) FROM public.bookings),
    'completed_bookings', (SELECT COUNT(*) FROM public.bookings WHERE status = 'completed'),
    'active_bookings', (SELECT COUNT(*) FROM public.bookings WHERE status = 'confirmed'),
    'gross_volume', COALESCE((SELECT SUM(gross_amount) FROM public.bookings WHERE status = 'completed'), 0),
    'platform_revenue', COALESCE((SELECT SUM(platform_fee_amount) FROM public.bookings WHERE status = 'completed'), 0),
    'talent_payouts_pending', COALESCE((SELECT SUM(amount) FROM public.payout_requests WHERE payout_status = 'requested'), 0),
    'talent_payouts_paid', COALESCE((SELECT SUM(amount) FROM public.payout_requests WHERE payout_status = 'paid'), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_overview TO authenticated;
