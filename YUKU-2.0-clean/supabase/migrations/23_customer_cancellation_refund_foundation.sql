-- ============================================================================
-- YUKU MIGRATION 23: CUSTOMER CANCELLATION & PARTIAL REFUND FOUNDATION
-- Apply only after migrations 01-22 in a fresh STAGING project.
-- Manual provider refund remains required; this migration never moves money.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customer_cancellation_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id),
  payment_id UUID REFERENCES public.payments(id),
  customer_id UUID NOT NULL REFERENCES public.customer_profiles(id),
  gross_amount BIGINT NOT NULL CHECK (gross_amount >= 0),
  automatic_refund_amount BIGINT NOT NULL DEFAULT 0 CHECK (automatic_refund_amount >= 0),
  retained_pending_admin_amount BIGINT NOT NULL DEFAULT 0 CHECK (retained_pending_admin_amount >= 0),
  hours_before_session NUMERIC(10,2),
  policy_code TEXT NOT NULL CHECK (policy_code IN ('unpaid_cancel','more_than_24h','6_to_24h','under_6h')),
  status TEXT NOT NULL DEFAULT 'pending_admin_review' CHECK (status IN ('no_admin_review_required','pending_admin_review','resolved')),
  admin_decision TEXT,
  admin_notes TEXT,
  resolved_by_admin_id UUID REFERENCES public.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (automatic_refund_amount + retained_pending_admin_amount = gross_amount)
);

ALTER TABLE public.customer_cancellation_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customer_cancellation_case_customer_or_admin_select" ON public.customer_cancellation_cases;
CREATE POLICY "customer_cancellation_case_customer_or_admin_select"
  ON public.customer_cancellation_cases FOR SELECT
  USING (customer_id = auth.uid() OR public.is_admin());
GRANT SELECT ON public.customer_cancellation_cases TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.customer_cancellation_cases FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_customer_cancellation(
  p_booking_id UUID,
  p_reason TEXT DEFAULT 'Dibatalkan oleh Customer melalui aplikasi'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_booking public.bookings%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_case_id UUID;
  v_refund_id UUID;
  v_hours NUMERIC(10,2);
  v_refund BIGINT := 0;
  v_retained BIGINT := 0;
  v_policy TEXT;
  v_status TEXT;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'Alasan pembatalan wajib diisi.'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND OR v_booking.customer_id <> v_actor THEN
    RAISE EXCEPTION 'Booking tidak ditemukan atau bukan milik Customer ini.';
  END IF;
  IF v_booking.status NOT IN (
    'pending_payment'::public.booking_status_type,
    'paid_held_in_escrow'::public.booking_status_type,
    'confirmed_by_talent'::public.booking_status_type
  ) THEN
    RAISE EXCEPTION 'Booking tidak dapat dibatalkan pada status saat ini.';
  END IF;
  IF v_booking.start_time <= NOW() THEN
    RAISE EXCEPTION 'Sesi sudah dimulai atau waktunya telah lewat; ajukan laporan ke Admin.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.customer_cancellation_cases WHERE booking_id = p_booking_id) THEN
    RAISE EXCEPTION 'Permintaan pembatalan untuk booking ini sudah tercatat.';
  END IF;

  IF v_booking.status = 'pending_payment'::public.booking_status_type THEN
    v_policy := 'unpaid_cancel';
    v_status := 'no_admin_review_required';
    v_hours := NULL;
    v_refund := 0;
    v_retained := 0;
    INSERT INTO public.customer_cancellation_cases (
      booking_id, customer_id, gross_amount, automatic_refund_amount,
      retained_pending_admin_amount, hours_before_session, policy_code, status
    ) VALUES (p_booking_id, v_actor, 0, 0, 0, NULL, v_policy, v_status)
    RETURNING id INTO v_case_id;
  ELSE
    SELECT * INTO v_payment FROM public.payments WHERE booking_id = p_booking_id FOR UPDATE;
    IF NOT FOUND OR v_payment.payment_status <> 'settled_held'::public.payment_status_type THEN
      RAISE EXCEPTION 'Pembayaran tidak ditemukan atau dana tidak lagi berada dalam escrow. Perlu peninjauan Admin.';
    END IF;

    v_hours := EXTRACT(EPOCH FROM (v_booking.start_time - NOW())) / 3600.0;
    IF v_hours > 24 THEN
      v_policy := 'more_than_24h';
      v_refund := v_payment.amount;
      v_retained := 0;
      v_status := 'no_admin_review_required';
    ELSIF v_hours >= 6 THEN
      v_policy := '6_to_24h';
      v_refund := FLOOR(v_payment.amount::NUMERIC / 2)::BIGINT;
      v_retained := v_payment.amount - v_refund;
      v_status := 'pending_admin_review';
    ELSE
      v_policy := 'under_6h';
      v_refund := 0;
      v_retained := v_payment.amount;
      v_status := 'pending_admin_review';
    END IF;

    INSERT INTO public.customer_cancellation_cases (
      booking_id, payment_id, customer_id, gross_amount, automatic_refund_amount,
      retained_pending_admin_amount, hours_before_session, policy_code, status
    ) VALUES (
      p_booking_id, v_payment.id, v_actor, v_payment.amount, v_refund,
      v_retained, v_hours, v_policy, v_status
    ) RETURNING id INTO v_case_id;

    IF v_refund > 0 THEN
      INSERT INTO public.refunds (payment_id, booking_id, customer_id, refund_amount, reason, status)
      VALUES (v_payment.id, p_booking_id, v_actor, v_refund, trim(p_reason), 'requested'::public.refund_status_type)
      RETURNING id INTO v_refund_id;
    END IF;
  END IF;

  UPDATE public.bookings
  SET status = 'cancelled_by_customer'::public.booking_status_type,
      cancellation_reason = trim(p_reason), updated_at = NOW()
  WHERE id = p_booking_id;

  -- Booking status history is maintained by the existing database trigger.
  -- Customer activity is intentionally not written into the Admin-only audit log.

  RETURN jsonb_build_object(
    'case_id', v_case_id, 'refund_id', v_refund_id, 'booking_id', p_booking_id,
    'policy_code', v_policy, 'automatic_refund_amount', v_refund,
    'retained_pending_admin_amount', v_retained, 'status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_customer_cancellation(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_customer_cancellation(UUID, TEXT) TO authenticated;

-- Correct the earlier refund processor: a partial refund must not mark the
-- entire payment as refunded. Finance still performs the actual provider refund.
CREATE OR REPLACE FUNCTION public.admin_process_refund(
  p_refund_id UUID,
  p_new_status public.refund_status_type,
  p_provider_refund_id TEXT DEFAULT NULL,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_refund public.refunds%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_already_processed BIGINT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya Admin/Finance YUKU yang dapat memproses refund.';
  END IF;
  IF p_new_status <> 'processed'::public.refund_status_type THEN
    RAISE EXCEPTION 'Refund hanya dapat ditandai selesai setelah pengembalian dana benar-benar dilakukan.';
  END IF;
  IF NULLIF(trim(COALESCE(p_provider_refund_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Referensi refund dari provider/bank wajib diisi.';
  END IF;

  SELECT * INTO v_refund FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Permintaan refund tidak ditemukan.'; END IF;
  IF v_refund.status NOT IN ('requested'::public.refund_status_type, 'approved'::public.refund_status_type) THEN
    RAISE EXCEPTION 'Permintaan refund sudah diproses atau ditolak.';
  END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = v_refund.payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pembayaran asal tidak ditemukan.'; END IF;
  IF v_payment.payment_status NOT IN ('settled_held'::public.payment_status_type, 'refunded'::public.payment_status_type) THEN
    RAISE EXCEPTION 'Pembayaran tidak berada dalam status yang dapat direfund.';
  END IF;

  SELECT COALESCE(SUM(refund_amount), 0)::BIGINT INTO v_already_processed
  FROM public.refunds
  WHERE payment_id = v_refund.payment_id
    AND status = 'processed'::public.refund_status_type
    AND id <> p_refund_id;
  IF v_already_processed + v_refund.refund_amount > v_payment.amount THEN
    RAISE EXCEPTION 'Total refund melebihi jumlah pembayaran.';
  END IF;

  UPDATE public.refunds
  SET status = 'processed'::public.refund_status_type,
      provider_refund_id = trim(p_provider_refund_id),
      processed_by_admin_id = auth.uid(), processed_at = NOW()
  WHERE id = p_refund_id;

  IF v_already_processed + v_refund.refund_amount >= v_payment.amount THEN
    UPDATE public.payments SET payment_status = 'refunded'::public.payment_status_type, updated_at = NOW()
    WHERE id = v_refund.payment_id;
  END IF;

  INSERT INTO public.admin_audit_logs (admin_user_id, action_type, target_table, target_id, old_data, new_data)
  VALUES (
    auth.uid(), 'admin_process_refund', 'refunds', p_refund_id::TEXT,
    jsonb_build_object('status', v_refund.status),
    jsonb_build_object('status', p_new_status, 'provider_refund_id', p_provider_refund_id,
      'admin_notes', p_admin_notes, 'payment_marked_refunded',
      (v_already_processed + v_refund.refund_amount >= v_payment.amount))
  );
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_process_refund(UUID, public.refund_status_type, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_process_refund(UUID, public.refund_status_type, TEXT, TEXT) TO authenticated;

COMMENT ON TABLE public.customer_cancellation_cases IS
'Customer cancellation policy snapshot. Retained amount is pending Admin decision and is not YUKU revenue or Talent earnings until a separately audited financial adjustment is implemented.';
COMMENT ON FUNCTION public.request_customer_cancellation(UUID, TEXT) IS
'Atomically cancels a future booking, snapshots the cancellation policy, creates a manual refund request where applicable, and records any retained amount for Admin review. Does not call a payment provider.';
