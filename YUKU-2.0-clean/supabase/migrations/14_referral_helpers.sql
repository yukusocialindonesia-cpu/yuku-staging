-- ============================================================================
-- MIGRATION 14: PROGRAM REFERRAL KOMUNITAS TALENT (RPC & PERBAIKAN GRANT)
-- Aman dijalankan ulang (Idempoten).
-- ============================================================================

-- 1. Perbaiki grant kolom pada referral_relationships (sebelumnya typo nama kolom di 08)
REVOKE INSERT ON public.referral_relationships FROM authenticated;
GRANT SELECT ON public.referral_relationships TO authenticated;
GRANT INSERT (referrer_id, referee_talent_id, referral_code_used) ON public.referral_relationships TO authenticated;
GRANT SELECT ON public.referral_rewards TO authenticated;

-- 2. RPC aman untuk menghubungkan Talent yang sedang login dengan kode referral pengundang
--    - 1-tier permanen (1 Talent hanya boleh memiliki 1 pengundang)
--    - Anti self-referral
--    - Tidak bergantung pada visibilitas publik talent_profiles pengundang
CREATE OR REPLACE FUNCTION public.apply_talent_referral_code(
  p_referral_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_code TEXT := UPPER(TRIM(COALESCE(p_referral_code, '')));
  v_referrer RECORD;
  v_existing_id UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan untuk menggunakan kode referral.';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'Kode referral tidak boleh kosong.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.talent_profiles WHERE id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'Profil Talent Anda belum terdaftar.';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.referral_relationships
  WHERE referee_talent_id = v_caller_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Akun Talent Anda sudah terhubung dengan kode referral sebelumnya.';
  END IF;

  SELECT id, display_name, referral_code
  INTO v_referrer
  FROM public.talent_profiles
  WHERE UPPER(referral_code) = v_code
  LIMIT 1;

  IF v_referrer.id IS NULL THEN
    RAISE EXCEPTION 'Kode referral % tidak ditemukan.', v_code;
  END IF;

  IF v_referrer.id = v_caller_id THEN
    RAISE EXCEPTION 'Anda tidak dapat menggunakan kode referral milik sendiri.';
  END IF;

  INSERT INTO public.referral_relationships (
    referrer_id,
    referee_talent_id,
    referral_code_used
  ) VALUES (
    v_referrer.id,
    v_caller_id,
    v_referrer.referral_code
  );

  RETURN jsonb_build_object(
    'referrer_id', v_referrer.id,
    'referrer_name', v_referrer.display_name,
    'referral_code_used', v_referrer.referral_code
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_talent_referral_code(TEXT) TO authenticated;

-- 3. RPC aman bagi Referrer untuk melihat daftar Talent yang diundang beserta nama & statusnya
CREATE OR REPLACE FUNCTION public.get_my_referral_network()
RETURNS TABLE (
  id UUID,
  referee_talent_id UUID,
  referee_name TEXT,
  referee_city TEXT,
  referee_account_status TEXT,
  referral_code_used VARCHAR(20),
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan.';
  END IF;

  RETURN QUERY
  SELECT
    rr.id,
    rr.referee_talent_id,
    COALESCE(tp.display_name, 'Talent Terdaftar')::TEXT AS referee_name,
    COALESCE(tp.city, '-')::TEXT AS referee_city,
    COALESCE(u.account_status::TEXT, 'pending_verification') AS referee_account_status,
    rr.referral_code_used,
    rr.is_active,
    rr.created_at
  FROM public.referral_relationships rr
  LEFT JOIN public.talent_profiles tp ON tp.id = rr.referee_talent_id
  LEFT JOIN public.users u ON u.id = rr.referee_talent_id
  WHERE rr.referrer_id = v_caller_id
  ORDER BY rr.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_referral_network() TO authenticated;

-- 4. Trigger notifikasi otomatis saat bonus referral dicatat atau dikreditkan
CREATE OR REPLACE FUNCTION public.notify_on_referral_reward_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, title, message, type, metadata)
    VALUES (
      NEW.referrer_id,
      'Potensi Bonus Referral Baru',
      'Talent yang Anda undang menerima pesanan berbayar. Estimasi bonus Rp ' ||
        TO_CHAR(NEW.reward_amount, 'FM999,999,999') || ' menunggu penyelesaian sesi.',
      'referral_bonus'::public.notification_type,
      jsonb_build_object('referral_reward_id', NEW.id, 'booking_id', NEW.booking_id, 'route', '/dashboard-talent')
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'credited'::public.referral_reward_status_type THEN
      INSERT INTO public.notifications (user_id, title, message, type, metadata)
      VALUES (
        NEW.referrer_id,
        'Bonus Referral Dikreditkan!',
        'Bonus referral sebesar Rp ' || TO_CHAR(NEW.reward_amount, 'FM999,999,999') ||
          ' telah resmi dikreditkan dari sesi Talent undangan Anda.',
        'referral_bonus'::public.notification_type,
        jsonb_build_object('referral_reward_id', NEW.id, 'booking_id', NEW.booking_id, 'route', '/dashboard-talent')
      );
    ELSIF NEW.status = 'cancelled_disputed'::public.referral_reward_status_type THEN
      INSERT INTO public.notifications (user_id, title, message, type, metadata)
      VALUES (
        NEW.referrer_id,
        'Bonus Referral Dibatalkan',
        'Bonus referral untuk salah satu pesanan Talent undangan dibatalkan karena pembatalan/sengketa.',
        'referral_bonus'::public.notification_type,
        jsonb_build_object('referral_reward_id', NEW.id, 'booking_id', NEW.booking_id, 'route', '/dashboard-talent')
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_referral_reward_change ON public.referral_rewards;
CREATE TRIGGER trg_notify_referral_reward_change
  AFTER INSERT OR UPDATE OF status ON public.referral_rewards
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_referral_reward_change();
