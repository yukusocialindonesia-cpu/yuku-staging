-- YUKU migration 32: persetujuan Admin kini benar-benar mengatur talent_profiles.is_approved.
-- Sebelumnya admin_review_talent() hanya memverifikasi KTP dan mengaktifkan akun, sehingga
-- talent tampil di katalog tetapi create_booking() (yang mensyaratkan is_approved = TRUE)
-- selalu menolak dengan "Talent is not available".

CREATE OR REPLACE FUNCTION public.admin_review_talent(
  p_talent_id UUID,
  p_is_approved BOOLEAN,
  p_ktp_status public.ktp_status_type,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role_type;
  v_ktp  public.ktp_status_type;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses Ditolak: Hanya Admin YUKU yang berhak mengubah status kurasi Talent.';
  END IF;

  SELECT u.role INTO v_role FROM public.users u WHERE u.id = p_talent_id;
  IF NOT FOUND OR v_role <> 'talent'::public.user_role_type THEN
    RAISE EXCEPTION 'Talent tidak ditemukan.';
  END IF;

  SELECT ui.ktp_verification_status INTO v_ktp
  FROM public.user_identities ui
  WHERE ui.id = p_talent_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data identitas talent belum ada.';
  END IF;

  IF p_is_approved THEN
    IF p_ktp_status IS DISTINCT FROM 'verified'::public.ktp_status_type THEN
      RAISE EXCEPTION 'Persetujuan talent mensyaratkan keputusan KTP "verified".';
    END IF;

    IF v_ktp = 'pending_review'::public.ktp_status_type THEN
      PERFORM public.admin_review_ktp(p_talent_id, 'verified'::public.ktp_status_type, NULL);
    ELSIF v_ktp <> 'verified'::public.ktp_status_type THEN
      RAISE EXCEPTION 'Status KTP saat ini (%) tidak dapat disetujui.', v_ktp;
    END IF;

    -- KTP sudah verified tetapi akun masih menunggu: aktifkan (akun suspended/banned tidak disentuh)
    UPDATE public.users
       SET account_status = 'active'::public.account_status_type
     WHERE id = p_talent_id
       AND account_status = 'pending_verification'::public.account_status_type;

    -- BARU: tandai profil talent sebagai disetujui agar dapat dipesan.
    UPDATE public.talent_profiles SET is_approved = TRUE WHERE id = p_talent_id;
  ELSE
    IF v_ktp = 'pending_review'::public.ktp_status_type THEN
      PERFORM public.admin_review_ktp(p_talent_id, 'rejected'::public.ktp_status_type, p_notes);
    ELSIF v_ktp <> 'rejected'::public.ktp_status_type THEN
      RAISE EXCEPTION 'Talent dengan status KTP "%" tidak dapat ditolak lewat fungsi ini.', v_ktp;
    END IF;

    UPDATE public.talent_profiles SET is_approved = FALSE WHERE id = p_talent_id;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_talent(UUID, BOOLEAN, public.ktp_status_type, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_talent(UUID, BOOLEAN, public.ktp_status_type, TEXT) TO authenticated;

-- Perbaiki data talent yang sudah terlanjur disetujui (KTP verified + akun aktif) tetapi is_approved masih FALSE.
UPDATE public.talent_profiles t
   SET is_approved = TRUE
  FROM public.users u
  JOIN public.user_identities i ON i.id = u.id
 WHERE t.id = u.id
   AND u.role = 'talent'::public.user_role_type
   AND u.account_status = 'active'::public.account_status_type
   AND i.ktp_verification_status = 'verified'::public.ktp_status_type
   AND t.is_approved IS NOT TRUE;
