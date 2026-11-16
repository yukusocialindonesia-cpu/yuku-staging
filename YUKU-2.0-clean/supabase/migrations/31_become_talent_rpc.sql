-- YUKU migration 31: customer dapat mengajukan diri sebagai talent.
-- Sebelumnya formulir "Jadi Talent" menyimpan profil tetapi tidak mengubah role,
-- sehingga admin_review_talent() menolak dengan "Talent tidak ditemukan".
-- Role talent saja TIDAK memberi akses publik: talent tetap harus disetujui Admin
-- dan KTP-nya diverifikasi sebelum tampil di katalog.

CREATE OR REPLACE FUNCTION public.become_talent()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role_type;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT u.role INTO v_role FROM public.users u WHERE u.id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun tidak ditemukan.';
  END IF;

  IF v_role = 'customer'::public.user_role_type THEN
    UPDATE public.users SET role = 'talent'::public.user_role_type WHERE id = auth.uid();
    RETURN 'talent';
  ELSIF v_role = 'talent'::public.user_role_type THEN
    RETURN 'talent';
  END IF;

  RAISE EXCEPTION 'Akun dengan peran % tidak dapat mendaftar sebagai talent.', v_role;
END;
$$;

REVOKE ALL ON FUNCTION public.become_talent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.become_talent() TO authenticated;

COMMENT ON FUNCTION public.become_talent() IS
  'Mengubah role customer menjadi talent untuk pemanggil. Idempotent. Admin tidak dapat dialihkan. Migration 31.';
