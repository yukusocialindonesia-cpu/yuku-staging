-- ============================================================================
-- YUKU MIGRATION 22: TALENT CANCELLATION & MANUAL REFUND WORKFLOW
-- Until a payment provider refund API is integrated, refunds are recorded and
-- confirmed by Finance after an actual refund is completed in the provider.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.request_talent_cancellation(
  p_booking_id UUID,
  p_reason TEXT
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
  v_refund_id UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NULLIF(trim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Alasan pembatalan wajib diisi.';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND OR v_booking.talent_id <> v_actor THEN
    RAISE EXCEPTION 'Booking tidak ditemukan atau Anda bukan Talent pemiliknya.';
  END IF;

  IF v_booking.status NOT IN (
    'paid_held_in_escrow'::public.booking_status_type,
    'confirmed_by_talent'::public.booking_status_type
  ) THEN
    RAISE EXCEPTION 'Booking tidak dapat dibatalkan oleh Talent pada status saat ini.';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE booking_id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND OR v_payment.payment_status <> 'settled_held'::public.payment_status_type THEN
    RAISE EXCEPTION 'Pembayaran tidak ditemukan atau tidak lagi berada dalam status escrow. Perlu peninjauan Admin.';
  END IF;

  INSERT INTO public.refunds (
    payment_id, booking_id, customer_id, refund_amount, reason, status
  ) VALUES (
    v_payment.id,
    p_booking_id,
    v_booking.customer_id,
    v_payment.amount,
    trim(p_reason),
    'requested'::public.refund_status_type
  ) RETURNING id INTO v_refund_id;

  UPDATE public.bookings
  SET status = 'cancelled_by_talent'::public.booking_status_type,
      cancellation_reason = trim(p_reason),
      updated_at = NOW()
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'refund_id', v_refund_id,
    'booking_id', p_booking_id,
    'refund_amount', v_payment.amount,
    'status', 'requested'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_talent_cancellation(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_talent_cancellation(UUID, TEXT) TO authenticated;

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
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya Admin/Finance YUKU yang dapat memproses refund.';
  END IF;

  SELECT * INTO v_refund
  FROM public.refunds
  WHERE id = p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permintaan refund tidak ditemukan.';
  END IF;

  IF v_refund.status NOT IN ('requested'::public.refund_status_type, 'approved'::public.refund_status_type) THEN
    RAISE EXCEPTION 'Permintaan refund sudah diproses atau ditolak.';
  END IF;

  IF p_new_status = 'processed'::public.refund_status_type THEN
    IF NULLIF(trim(COALESCE(p_provider_refund_id, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Referensi refund dari provider/bank wajib diisi.';
    END IF;

    UPDATE public.refunds
    SET status = 'processed'::public.refund_status_type,
        provider_refund_id = trim(p_provider_refund_id),
        processed_by_admin_id = auth.uid(),
        processed_at = NOW()
    WHERE id = p_refund_id;

    UPDATE public.payments
    SET payment_status = 'refunded'::public.payment_status_type,
        updated_at = NOW()
    WHERE id = v_refund.payment_id;

  ELSE
    RAISE EXCEPTION 'Refund akibat pembatalan oleh Talent tidak boleh ditolak otomatis. Biarkan tetap menunggu dan eskalasikan ke Finance.';
  END IF;

  INSERT INTO public.admin_audit_logs (
    admin_user_id, action_type, target_table, target_id, old_data, new_data
  ) VALUES (
    auth.uid(),
    'admin_process_refund',
    'refunds',
    p_refund_id::TEXT,
    jsonb_build_object('status', v_refund.status),
    jsonb_build_object('status', p_new_status, 'provider_refund_id', p_provider_refund_id, 'admin_notes', p_admin_notes)
  );

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_process_refund(UUID, public.refund_status_type, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_process_refund(UUID, public.refund_status_type, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.request_talent_cancellation(UUID, TEXT) IS
'Creates a full refund request when a Talent cancels a paid/confirmed booking still held in escrow. Does not call a payment provider.';
COMMENT ON FUNCTION public.admin_process_refund(UUID, public.refund_status_type, TEXT, TEXT) IS
'Manual refund recording workflow. Finance must execute the real refund externally and enter its provider/bank reference before marking processed.';
