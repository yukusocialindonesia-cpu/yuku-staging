-- ============================================================================
-- YUKU MIGRATION 18: SECURITY & PAYOUT GUARDRAILS
-- Append-only remediation. Apply AFTER migrations 01-17 in a staging database.
-- Do not run against production until the complete migration chain is validated.
-- ============================================================================

-- 1) Never trust public signup metadata or an email address to grant Admin.
--    Admin provisioning must be performed out-of-band by the project owner.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_meta_role TEXT;
  v_final_role public.user_role_type;
  v_display_name TEXT;
BEGIN
  v_meta_role := lower(trim(COALESCE(NEW.raw_user_meta_data ->> 'user_role', '')));
  v_final_role := CASE
    WHEN v_meta_role = 'talent' THEN 'talent'::public.user_role_type
    ELSE 'customer'::public.user_role_type
  END;

  v_display_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'Pengguna YUKU'
  );

  INSERT INTO public.users (id, email, full_name, phone_number, role, is_verified_18, account_status)
  VALUES (
    NEW.id,
    NEW.email,
    v_display_name,
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'phone_number', '')), ''),
    v_final_role,
    FALSE,
    'pending_verification'::public.account_status_type
  )
  ON CONFLICT (id) DO NOTHING;

  -- Signup must not invent a customer's gender or city.
  INSERT INTO public.customer_profiles (id, display_name, city, gender, bio)
  VALUES (NEW.id, v_display_name, NULL, NULL, 'Pengguna Komunitas YUKU')
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

ALTER TABLE public.customer_profiles ALTER COLUMN city DROP NOT NULL;
ALTER TABLE public.customer_profiles ALTER COLUMN gender DROP NOT NULL;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Refund records must be created only by trusted server-side workflows.
REVOKE INSERT ON public.refunds FROM authenticated;
REVOKE INSERT (payment_id, customer_id, reason, refund_amount) ON public.refunds FROM authenticated;


-- Allow only trusted database owner sessions to perform one-time role provisioning.
CREATE OR REPLACE FUNCTION public.prevent_user_security_column_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_admin() THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Kolom identitas sistem tidak dapat diubah.';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.is_verified_18 IS DISTINCT FROM OLD.is_verified_18
       OR NEW.account_status IS DISTINCT FROM OLD.account_status THEN
      RAISE EXCEPTION 'Kolom role, verifikasi usia, dan status akun hanya dapat diubah melalui proses administratif yang sah.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_admin_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Provisioning Admin hanya boleh dijalankan oleh pemilik database melalui SQL Editor tepercaya.';
  END IF;

  UPDATE public.users
  SET role = 'admin'::public.user_role_type,
      is_verified_18 = TRUE,
      account_status = 'active'::public.account_status_type,
      updated_at = NOW()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User ID tidak ditemukan. Buat akun melalui signup terlebih dahulu.';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_admin_user(UUID) FROM PUBLIC, anon, authenticated;

-- 2) Chat messages: authenticated users may update ONLY is_read.
--    A recipient may transition a message from unread to read, never edit content.
CREATE OR REPLACE FUNCTION public.guard_booking_message_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Isi dan identitas pesan tidak dapat diubah.';
  END IF;

  IF OLD.is_read IS TRUE OR NEW.is_read IS NOT TRUE THEN
    RAISE EXCEPTION 'Status pesan hanya boleh berubah satu kali dari belum dibaca menjadi dibaca.';
  END IF;

  IF auth.uid() IS NULL OR OLD.sender_id = auth.uid() THEN
    RAISE EXCEPTION 'Hanya penerima pesan yang dapat menandai pesan sebagai dibaca.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = OLD.booking_id
      AND (b.customer_id = auth.uid() OR b.talent_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Anda bukan peserta booking ini.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_booking_message_update ON public.booking_messages;
CREATE TRIGGER trg_guard_booking_message_update
BEFORE UPDATE ON public.booking_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_booking_message_update();

REVOKE UPDATE ON public.booking_messages FROM authenticated;
GRANT UPDATE (is_read) ON public.booking_messages TO authenticated;
REVOKE ALL ON FUNCTION public.guard_booking_message_update() FROM PUBLIC, anon, authenticated;

-- Recreate the update policy with the same participant boundary.
DROP POLICY IF EXISTS "booking_messages_update_read_recipient" ON public.booking_messages;
CREATE POLICY "booking_messages_update_read_recipient" ON public.booking_messages
FOR UPDATE TO authenticated
USING (
  sender_id <> auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_id
      AND (b.customer_id = auth.uid() OR b.talent_id = auth.uid())
  )
)
WITH CHECK (
  sender_id <> auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_id
      AND (b.customer_id = auth.uid() OR b.talent_id = auth.uid())
  )
);

-- 3) Distinguish payout providers from payment providers. Manual bank transfer
--    is an operational payout route, not a payment gateway.
DO $$ BEGIN
  CREATE TYPE public.payout_provider_type AS ENUM ('manual', 'xendit', 'midtrans');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.payout_requests ALTER COLUMN payout_provider DROP DEFAULT;
ALTER TABLE public.payout_requests
  ALTER COLUMN payout_provider TYPE public.payout_provider_type
  USING (CASE WHEN payout_provider::TEXT = 'simulation' THEN 'manual' ELSE payout_provider::TEXT END)::public.payout_provider_type;
ALTER TABLE public.payout_requests
  ALTER COLUMN payout_provider SET DEFAULT 'manual'::public.payout_provider_type;

CREATE OR REPLACE FUNCTION public.force_manual_payout_provider()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.payout_provider := 'manual'::public.payout_provider_type;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_manual_payout_provider ON public.payout_requests;
CREATE TRIGGER trg_force_manual_payout_provider
BEFORE INSERT ON public.payout_requests
FOR EACH ROW EXECUTE FUNCTION public.force_manual_payout_provider();
REVOKE ALL ON FUNCTION public.force_manual_payout_provider() FROM PUBLIC, anon, authenticated;

-- 4) Admin payout workflow: request -> processing -> provider-confirmed completion.
--    Completion requires an actual bank/provider transfer reference.
DROP FUNCTION IF EXISTS public.admin_process_payout(UUID, public.payout_status_type, TEXT);

CREATE OR REPLACE FUNCTION public.admin_process_payout(
  p_payout_id UUID,
  p_new_status public.payout_status_type,
  p_rejection_reason TEXT DEFAULT NULL,
  p_provider_reference TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_status public.payout_status_type;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya Admin YUKU yang dapat memproses pencairan.';
  END IF;

  SELECT payout_status INTO v_current_status
  FROM public.payout_requests
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permintaan pencairan tidak ditemukan.';
  END IF;

  IF p_new_status = 'processing'::public.payout_status_type THEN
    IF v_current_status <> 'requested'::public.payout_status_type THEN
      RAISE EXCEPTION 'Hanya permintaan berstatus requested yang dapat diproses.';
    END IF;
    UPDATE public.payout_requests
    SET payout_status = 'processing'::public.payout_status_type,
        processed_by_admin_id = auth.uid()
    WHERE id = p_payout_id;

  ELSIF p_new_status = 'rejected'::public.payout_status_type THEN
    IF v_current_status NOT IN ('requested'::public.payout_status_type, 'processing'::public.payout_status_type) THEN
      RAISE EXCEPTION 'Status pencairan ini tidak dapat ditolak.';
    END IF;
    IF NULLIF(trim(COALESCE(p_rejection_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Alasan penolakan wajib diisi.';
    END IF;
    UPDATE public.payout_requests
    SET payout_status = 'rejected'::public.payout_status_type,
        rejection_reason = trim(p_rejection_reason),
        processed_by_admin_id = auth.uid()
    WHERE id = p_payout_id;

  ELSIF p_new_status = 'completed_provider_confirmed'::public.payout_status_type THEN
    IF v_current_status <> 'processing'::public.payout_status_type THEN
      RAISE EXCEPTION 'Pencairan harus berstatus processing sebelum diselesaikan.';
    END IF;
    IF NULLIF(trim(COALESCE(p_provider_reference, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Nomor referensi transfer bank/provider wajib diisi sebelum menyelesaikan pencairan.';
    END IF;
    UPDATE public.payout_requests
    SET payout_status = 'completed_provider_confirmed'::public.payout_status_type,
        payout_provider_ref = trim(p_provider_reference),
        provider_confirmed_at = NOW(),
        processed_by_admin_id = auth.uid(),
        rejection_reason = NULL
    WHERE id = p_payout_id;

  ELSE
    RAISE EXCEPTION 'Transisi status pencairan tidak diizinkan.';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_process_payout(UUID, public.payout_status_type, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_process_payout(UUID, public.payout_status_type, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.handle_new_user() IS
'Creates customer/talent accounts only. Admin role must be provisioned out-of-band by an authorized project owner.';
COMMENT ON FUNCTION public.admin_process_payout(UUID, public.payout_status_type, TEXT, TEXT) IS
'Admin payout state machine. Completion requires a non-empty external bank/provider transfer reference.';
