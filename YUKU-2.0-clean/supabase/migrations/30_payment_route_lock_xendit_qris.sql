-- YUKU MIGRATION 30: ONE PAYMENT ROUTE PER BOOKING
-- Prevents Xendit and manual QRIS from becoming active concurrently.
-- Existing payment rows are backfilled before the constraint is enforced.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_route TEXT;

UPDATE public.bookings b
SET payment_route = p.provider::TEXT,
    updated_at = NOW()
FROM public.payments p
WHERE p.booking_id = b.id
  AND b.payment_route IS NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_route_check;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_route_check
  CHECK (payment_route IS NULL OR payment_route IN ('xendit', 'manual_qris'));

CREATE INDEX IF NOT EXISTS idx_bookings_payment_route
  ON public.bookings(payment_route);

-- Atomically claims the only payment route for a booking.
-- The booking row lock makes Xendit-vs-QRIS races deterministic.
CREATE OR REPLACE FUNCTION public.claim_booking_payment_route(
  p_booking_id UUID,
  p_route TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF p_route NOT IN ('xendit', 'manual_qris') THEN
    RAISE EXCEPTION 'Jalur pembayaran tidak valid.';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND OR v_booking.customer_id <> v_actor THEN
    RAISE EXCEPTION 'Booking tidak ditemukan.';
  END IF;
  IF v_booking.status <> 'pending_payment'::public.booking_status_type THEN
    RAISE EXCEPTION 'Booking tidak lagi menunggu pembayaran.';
  END IF;
  IF v_booking.payment_expires_at <= NOW() THEN
    RAISE EXCEPTION 'Batas waktu pembayaran telah kedaluwarsa.';
  END IF;

  IF v_booking.payment_route IS NULL THEN
    UPDATE public.bookings
    SET payment_route = p_route, updated_at = NOW()
    WHERE id = p_booking_id;
    RETURN TRUE;
  END IF;

  IF v_booking.payment_route <> p_route THEN
    RAISE EXCEPTION 'Booking ini sudah mengunci jalur pembayaran % dan tidak dapat berpindah ke jalur lain.', v_booking.payment_route;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_booking_payment_route(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_booking_payment_route(UUID, TEXT) TO authenticated;

COMMENT ON COLUMN public.bookings.payment_route IS
  'Immutable active payment route for this booking: xendit or manual_qris. NULL means no route has been selected yet.';
COMMENT ON FUNCTION public.claim_booking_payment_route(UUID, TEXT) IS
  'Atomically locks exactly one payment route per booking. Xendit and manual QRIS cannot become active simultaneously.';

-- Defense-in-depth: a trusted settlement may only settle through the route already locked.
-- Legacy NULL routes are assigned to the provider being settled, provided the booking is still pending.
CREATE OR REPLACE FUNCTION public.settle_booking_payment(
  p_booking_id UUID,
  p_provider public.payment_provider_type DEFAULT 'xendit',
  p_provider_charge_id TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'qris',
  p_webhook_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_route TEXT := p_provider::TEXT;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin')
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Akses Ditolak: settle_booking_payment hanya boleh dipanggil dari server (service_role).';
  END IF;
  IF p_provider NOT IN ('xendit'::public.payment_provider_type, 'manual_qris'::public.payment_provider_type) THEN
    RAISE EXCEPTION 'Provider pembayaran tidak diizinkan untuk settlement.';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % tidak ditemukan.', p_booking_id;
  END IF;

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
        cancellation_reason = 'Batas waktu pembayaran telah habis',
        updated_at = NOW()
    WHERE id = p_booking_id;
    RAISE EXCEPTION 'Batas waktu pembayaran untuk booking % telah kedaluwarsa.', p_booking_id;
  END IF;

  IF v_booking.payment_route IS NULL THEN
    UPDATE public.bookings
    SET payment_route = v_route, updated_at = NOW()
    WHERE id = p_booking_id;
  ELSIF v_booking.payment_route <> v_route THEN
    RAISE EXCEPTION 'Pembayaran ditolak: booking terkunci pada jalur %.', v_booking.payment_route;
  END IF;

  INSERT INTO public.payments (
    booking_id, provider, provider_charge_id, payment_method, amount,
    payment_status, paid_at, webhook_payload_history
  ) VALUES (
    v_booking.id, p_provider, p_provider_charge_id,
    COALESCE(NULLIF(TRIM(p_payment_method), ''), 'qris'),
    v_booking.gross_amount, 'settled_held'::public.payment_status_type,
    NOW(), ARRAY[COALESCE(p_webhook_payload, '{}'::jsonb)]
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
$$;

REVOKE ALL ON FUNCTION public.settle_booking_payment(UUID, public.payment_provider_type, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_booking_payment(UUID, public.payment_provider_type, TEXT, TEXT, JSONB) TO service_role;
