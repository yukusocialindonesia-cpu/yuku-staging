-- ============================================================================
-- YUKU MIGRATION 19: SERVER-SIDE BOOKING CREATION RPC
-- Adds the RPC already called by src/pages/TalentDetailPage.tsx.
-- Apply AFTER migrations 01-18 in staging; do not run on production unreviewed.
-- ============================================================================

-- Server-side feature gate. Checkout stays disabled until the payment gateway,
-- checkout creation, webhook verification, and reconciliation are implemented.
CREATE TABLE IF NOT EXISTS public.system_feature_flags (
  flag_key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.system_feature_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_feature_flags FROM PUBLIC, anon, authenticated;
INSERT INTO public.system_feature_flags (flag_key, enabled)
VALUES ('payment_checkout', FALSE)
ON CONFLICT (flag_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_booking(
  p_talent_id UUID,
  p_activity_category_id TEXT,
  p_booking_mode public.booking_mode_type,
  p_start_time TIMESTAMPTZ,
  p_duration_hours NUMERIC,
  p_meeting_location_name TEXT,
  p_meeting_location_address TEXT DEFAULT NULL
)
RETURNS SETOF public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id UUID := auth.uid();
  v_customer public.users%ROWTYPE;
  v_talent public.users%ROWTYPE;
  v_profile public.talent_profiles%ROWTYPE;
  v_rate BIGINT;
  v_gross BIGINT;
  v_platform_fee BIGINT;
  v_talent_share BIGINT;
  v_start_local TIMESTAMP;
  v_end_local TIMESTAMP;
  v_has_any_schedule BOOLEAN;
  v_has_specific_schedule BOOLEAN;
  v_checkout_enabled BOOLEAN := FALSE;
BEGIN
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT enabled INTO v_checkout_enabled
  FROM public.system_feature_flags
  WHERE flag_key = 'payment_checkout';

  IF COALESCE(v_checkout_enabled, FALSE) IS NOT TRUE THEN
    RAISE EXCEPTION 'Payment gateway YUKU belum aktif. Booking berbayar sementara ditutup.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.customer_id = v_customer_id
      AND b.status = 'pending_payment'::public.booking_status_type
      AND b.payment_expires_at > NOW()
  ) THEN
    RAISE EXCEPTION 'Anda masih memiliki booking yang menunggu pembayaran. Selesaikan atau tunggu kedaluwarsa sebelum membuat booking baru.';
  END IF;

  IF p_talent_id IS NULL OR p_talent_id = v_customer_id THEN
    RAISE EXCEPTION 'Self booking is not allowed';
  END IF;

  IF p_activity_category_id IS NULL OR trim(p_activity_category_id) = '' THEN
    RAISE EXCEPTION 'Activity category is required';
  END IF;

  IF p_booking_mode IS NULL OR p_start_time IS NULL OR p_duration_hours IS NULL
     OR p_duration_hours <= 0 OR p_duration_hours > 5 THEN
    RAISE EXCEPTION 'Invalid booking schedule or duration';
  END IF;

  IF p_start_time < NOW() + INTERVAL '2 hours' THEN
    RAISE EXCEPTION 'Booking start time must be at least two hours in the future';
  END IF;

  IF NULLIF(trim(COALESCE(p_meeting_location_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Meeting location is required';
  END IF;

  SELECT * INTO v_customer
  FROM public.users
  WHERE id = v_customer_id
  FOR SHARE;

  IF NOT FOUND OR v_customer.role <> 'customer'::public.user_role_type
     OR v_customer.account_status <> 'active'::public.account_status_type
     OR v_customer.is_verified_18 IS NOT TRUE THEN
    RAISE EXCEPTION 'Customer account is not eligible';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_identities ui
    WHERE ui.id = v_customer_id
      AND ui.ktp_verification_status = 'verified'::public.ktp_status_type
  ) THEN
    RAISE EXCEPTION 'Customer KTP verification required';
  END IF;

  SELECT * INTO v_talent
  FROM public.users
  WHERE id = p_talent_id
  FOR SHARE;

  IF NOT FOUND OR v_talent.role <> 'talent'::public.user_role_type
     OR v_talent.account_status <> 'active'::public.account_status_type
     OR v_talent.is_verified_18 IS NOT TRUE THEN
    RAISE EXCEPTION 'Talent is not available';
  END IF;

  SELECT * INTO v_profile
  FROM public.talent_profiles
  WHERE id = p_talent_id
    AND is_approved IS TRUE;

  IF NOT FOUND OR NOT public.is_talent_publicly_visible(p_talent_id) THEN
    RAISE EXCEPTION 'Talent is not available';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.activity_categories ac
    WHERE ac.id = p_activity_category_id AND ac.is_active IS TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM public.talent_services ts
    WHERE ts.talent_id = p_talent_id
      AND ts.activity_category_id = p_activity_category_id
  ) THEN
    RAISE EXCEPTION 'Talent does not offer this category';
  END IF;

  IF p_booking_mode = 'online'::public.booking_mode_type
     AND v_profile.online_chat_rate IS NULL THEN
    RAISE EXCEPTION 'Talent does not offer online sessions';
  END IF;

  IF (p_booking_mode = 'online'::public.booking_mode_type
      AND v_profile.service_mode = 'Offline Only'::public.service_mode_type)
     OR (p_booking_mode = 'offline'::public.booking_mode_type
      AND v_profile.service_mode = 'Online Only'::public.service_mode_type) THEN
    RAISE EXCEPTION 'Talent does not offer this booking mode';
  END IF;

  SELECT COALESCE(
    ts.custom_rate_override,
    CASE
      WHEN p_booking_mode = 'online'::public.booking_mode_type THEN v_profile.online_chat_rate
      ELSE v_profile.hourly_rate
    END
  )
  INTO v_rate
  FROM public.talent_services ts
  WHERE ts.talent_id = p_talent_id
    AND ts.activity_category_id = p_activity_category_id;

  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'Talent rate is not configured for this service';
  END IF;

  -- Availability rows are interpreted in Indonesia Western Time (Asia/Jakarta).
  -- If a Talent has no schedule configured, retain the current open-booking behavior.
  v_start_local := p_start_time AT TIME ZONE 'Asia/Jakarta';
  v_end_local := (p_start_time + make_interval(secs => (p_duration_hours * 3600)::DOUBLE PRECISION)) AT TIME ZONE 'Asia/Jakarta';

  SELECT EXISTS (
    SELECT 1 FROM public.talent_availability ta WHERE ta.talent_id = p_talent_id
  ) INTO v_has_any_schedule;

  IF v_has_any_schedule THEN
    IF v_start_local::DATE <> v_end_local::DATE THEN
      RAISE EXCEPTION 'Booking tidak dapat melewati tengah malam karena jadwal Talent menggunakan slot harian.';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.talent_availability ta
      WHERE ta.talent_id = p_talent_id
        AND ta.specific_date = v_start_local::DATE
    ) INTO v_has_specific_schedule;

    IF v_has_specific_schedule THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.talent_availability ta
        WHERE ta.talent_id = p_talent_id
          AND ta.specific_date = v_start_local::DATE
          AND ta.is_available IS TRUE
          AND ta.start_time <= v_start_local::TIME
          AND ta.end_time >= v_end_local::TIME
      ) THEN
        RAISE EXCEPTION 'Talent is not available';
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM public.talent_availability ta
        WHERE ta.talent_id = p_talent_id
          AND ta.specific_date IS NULL
          AND ta.day_of_week = EXTRACT(DOW FROM v_start_local)::INT
          AND ta.is_available IS TRUE
          AND ta.start_time <= v_start_local::TIME
          AND ta.end_time >= v_end_local::TIME
      ) THEN
        RAISE EXCEPTION 'Talent is not available';
      END IF;
    END IF;
  END IF;

  v_gross := ROUND(v_rate::NUMERIC * p_duration_hours)::BIGINT;
  IF v_gross <= 0 THEN
    RAISE EXCEPTION 'Booking amount must be greater than zero';
  END IF;
  v_platform_fee := ROUND(v_gross::NUMERIC * 0.20)::BIGINT;
  v_talent_share := v_gross - v_platform_fee;

  RETURN QUERY
  INSERT INTO public.bookings (
    booking_code,
    customer_id,
    talent_id,
    activity_category_id,
    booking_mode,
    start_time,
    end_time,
    duration_hours,
    meeting_location_name,
    meeting_location_address,
    hourly_rate_snapshot,
    gross_amount,
    platform_fee_amount,
    talent_gross_share,
    status
  ) VALUES (
    'YKB-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 12)),
    v_customer_id,
    p_talent_id,
    p_activity_category_id,
    p_booking_mode,
    p_start_time,
    p_start_time + make_interval(secs => (p_duration_hours * 3600)::DOUBLE PRECISION),
    p_duration_hours,
    trim(p_meeting_location_name),
    NULLIF(trim(COALESCE(p_meeting_location_address, '')), ''),
    v_rate,
    v_gross,
    v_platform_fee,
    v_talent_share,
    'pending_payment'::public.booking_status_type
  )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking(UUID, TEXT, public.booking_mode_type, TIMESTAMPTZ, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_booking(UUID, TEXT, public.booking_mode_type, TIMESTAMPTZ, NUMERIC, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.create_booking(UUID, TEXT, public.booking_mode_type, TIMESTAMPTZ, NUMERIC, TEXT, TEXT) IS
'Creates a pending booking after server-side identity, account, service, mode, availability, and pricing checks. Payment is not collected by this RPC.';
