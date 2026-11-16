-- ============================================================================
-- YUKU MIGRATION 26: ADMIN RESOLUTION FOR CUSTOMER CANCELLATION HOLDS
-- Append after migration 25. Staging validation is mandatory before production.
-- No payment provider is called by this migration.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customer_cancellation_case_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.customer_cancellation_cases(id),
  admin_user_id UUID NOT NULL REFERENCES public.users(id),
  decision TEXT NOT NULL CHECK (decision IN ('refund_customer', 'compensate_talent', 'extend_hold')),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  provider_refund_id TEXT,
  hold_until TIMESTAMPTZ,
  admin_notes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (decision = 'extend_hold' AND hold_until IS NOT NULL AND provider_refund_id IS NULL)
    OR (decision = 'refund_customer' AND hold_until IS NULL AND provider_refund_id IS NOT NULL)
    OR (decision = 'compensate_talent' AND hold_until IS NULL AND provider_refund_id IS NULL)
  )
);

-- Keep the currently active extension visible on the case itself.
ALTER TABLE public.customer_cancellation_cases
  ADD COLUMN IF NOT EXISTS admin_hold_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customer_cancellation_cases_admin_hold
  ON public.customer_cancellation_cases(admin_hold_until)
  WHERE status = 'pending_admin_review';

CREATE INDEX IF NOT EXISTS idx_cancellation_decisions_case
  ON public.customer_cancellation_case_decisions(case_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_refunds_provider_refund_id
  ON public.refunds(provider_refund_id) WHERE provider_refund_id IS NOT NULL;
ALTER TABLE public.customer_cancellation_case_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_cancellation_case_decisions FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "admin_read_cancellation_case_decisions" ON public.customer_cancellation_case_decisions;
CREATE POLICY "admin_read_cancellation_case_decisions"
  ON public.customer_cancellation_case_decisions
  FOR SELECT TO authenticated
  USING (public.is_admin());
GRANT SELECT ON public.customer_cancellation_case_decisions TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_customer_cancellation_case(
  p_case_id UUID,
  p_decision TEXT,
  p_admin_notes TEXT,
  p_provider_refund_id TEXT DEFAULT NULL,
  p_hold_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_case public.customer_cancellation_cases%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_earning public.talent_earnings%ROWTYPE;
  v_processed_refunds BIGINT := 0;
  v_amount BIGINT := 0;
  v_net BIGINT := 0;
  v_decision_id UUID;
  v_refund_id UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya Admin YUKU yang dapat memutuskan kasus ini.';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('refund_customer', 'compensate_talent', 'extend_hold') THEN
    RAISE EXCEPTION 'Keputusan Admin tidak valid.';
  END IF;
  IF NULLIF(trim(COALESCE(p_admin_notes, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Alasan/hasil pemeriksaan Admin wajib dicatat.';
  END IF;

  SELECT * INTO v_case
  FROM public.customer_cancellation_cases
  WHERE id = p_case_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kasus pembatalan tidak ditemukan.'; END IF;
  IF v_case.status <> 'pending_admin_review' THEN
    RAISE EXCEPTION 'Kasus ini sudah tidak menunggu keputusan Admin.';
  END IF;
  v_amount := v_case.retained_pending_admin_amount;
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Kasus ini tidak memiliki dana tertahan.'; END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = v_case.booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking asal tidak ditemukan.'; END IF;
  IF v_case.payment_id IS NULL THEN RAISE EXCEPTION 'Kasus tidak memiliki pembayaran terkait.'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = v_case.payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pembayaran asal tidak ditemukan.'; END IF;

  -- Any automatic refund must have been executed and recorded before the
  -- retained balance can be finally allocated or refunded.
  SELECT COALESCE(SUM(refund_amount), 0)::BIGINT
  INTO v_processed_refunds
  FROM public.refunds
  WHERE payment_id = v_payment.id
    AND status = 'processed'::public.refund_status_type;
  IF v_processed_refunds < v_case.automatic_refund_amount THEN
    RAISE EXCEPTION 'Refund otomatis Customer belum seluruhnya dikonfirmasi selesai.';
  END IF;

  IF p_decision = 'extend_hold' THEN
    IF p_hold_until IS NULL OR p_hold_until <= NOW() THEN
      RAISE EXCEPTION 'Tanggal/jam perpanjangan penahanan harus berada di masa depan.';
    END IF;
    INSERT INTO public.customer_cancellation_case_decisions
      (case_id, admin_user_id, decision, amount, hold_until, admin_notes)
    VALUES (p_case_id, auth.uid(), p_decision, v_amount, p_hold_until, trim(p_admin_notes))
    RETURNING id INTO v_decision_id;

    UPDATE public.customer_cancellation_cases
    SET admin_decision = 'extend_hold',
        admin_notes = trim(p_admin_notes),
        admin_hold_until = p_hold_until
    WHERE id = p_case_id;

  ELSIF p_decision = 'refund_customer' THEN
    IF NULLIF(trim(COALESCE(p_provider_refund_id, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Referensi refund provider/bank wajib diisi setelah dana benar-benar dikembalikan.';
    END IF;
    IF v_payment.payment_status NOT IN ('settled_held'::public.payment_status_type, 'refunded'::public.payment_status_type) THEN
      RAISE EXCEPTION 'Status pembayaran tidak memungkinkan refund dana tertahan.';
    END IF;
    IF v_processed_refunds + v_amount > v_payment.amount THEN
      RAISE EXCEPTION 'Total refund akan melebihi nilai pembayaran.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.refunds WHERE provider_refund_id = trim(p_provider_refund_id)) THEN
      RAISE EXCEPTION 'Referensi refund provider sudah pernah digunakan.';
    END IF;

    INSERT INTO public.refunds (
      payment_id, booking_id, customer_id, refund_amount, reason,
      provider_refund_id, status, processed_by_admin_id, processed_at
    ) VALUES (
      v_payment.id, v_booking.id, v_case.customer_id, v_amount,
      'Keputusan Admin atas dana tertahan: ' || trim(p_admin_notes),
      trim(p_provider_refund_id), 'processed'::public.refund_status_type,
      auth.uid(), NOW()
    ) RETURNING id INTO v_refund_id;

    INSERT INTO public.customer_cancellation_case_decisions
      (case_id, admin_user_id, decision, amount, provider_refund_id, admin_notes)
    VALUES (p_case_id, auth.uid(), p_decision, v_amount, trim(p_provider_refund_id), trim(p_admin_notes))
    RETURNING id INTO v_decision_id;

    IF v_processed_refunds + v_amount >= v_payment.amount THEN
      UPDATE public.payments
      SET payment_status = 'refunded'::public.payment_status_type, updated_at = NOW()
      WHERE id = v_payment.id;
    END IF;

    -- Reverse the held Talent earning in the auditable reversal ledger.
    -- The cancellation trigger intentionally skipped this while Admin review
    -- was pending, so this final decision must complete the financial reversal.
    SELECT * INTO v_earning
    FROM public.talent_earnings
    WHERE booking_id = v_booking.id
    FOR UPDATE;

    IF FOUND THEN
      IF v_earning.allocated_payout_amount > 0 OR v_earning.paid_out_amount > 0 THEN
        RAISE EXCEPTION 'Refund tidak dapat diselesaikan: pendapatan Talent sudah dialokasikan atau dibayarkan. Perlu pemeriksaan Finance.';
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.financial_adjustments_reversals
        WHERE booking_id = v_booking.id
      ) THEN
        RAISE EXCEPTION 'Jurnal pembalikan untuk booking ini sudah ada. Perlu rekonsiliasi Finance.';
      END IF;

      INSERT INTO public.financial_adjustments_reversals (
        booking_id, talent_id, refund_id, original_talent_earning_id,
        reversal_amount, reason
      ) VALUES (
        v_booking.id, v_booking.talent_id, v_refund_id, v_earning.id,
        v_earning.net_earning,
        'Pembalikan pendapatan setelah Admin memutuskan refund Customer: ' || trim(p_admin_notes)
      );

      UPDATE public.talent_earnings
      SET status = 'refund_adjusted'::public.talent_earning_status_type,
          status_before_dispute = NULL
      WHERE id = v_earning.id;
    END IF;

    -- A full cancellation refund carries no YUKU commission or referral share.
    UPDATE public.commission_records
    SET platform_commission_amount = 0,
        talent_gross_share = 0,
        referral_payout_reserved = 0,
        net_platform_revenue = 0
    WHERE booking_id = v_booking.id;

    UPDATE public.referral_rewards
    SET status = 'cancelled_disputed'::public.referral_reward_status_type,
        status_before_dispute = NULL
    WHERE booking_id = v_booking.id;

    UPDATE public.customer_cancellation_cases
    SET status = 'resolved', admin_decision = 'refund_customer',
        admin_notes = trim(p_admin_notes), admin_hold_until = NULL, resolved_by_admin_id = auth.uid(), resolved_at = NOW()
    WHERE id = p_case_id;

  ELSIF p_decision = 'compensate_talent' THEN
    SELECT * INTO v_earning
    FROM public.talent_earnings
    WHERE booking_id = v_booking.id
    FOR UPDATE;

    IF FOUND AND (v_earning.allocated_payout_amount > 0 OR v_earning.paid_out_amount > 0) THEN
      RAISE EXCEPTION 'Kompensasi tidak dapat diproses: pendapatan booking sudah dialokasikan untuk payout atau dibayarkan.';
    END IF;

    IF FOUND THEN
      -- Approved business rule: 100% of retained funds is Talent compensation.
      -- Do not deduct platform commission, referral, tax withholding, or transfer
      -- fee from this compensation ledger entry. Any legally required tax handling
      -- must be handled separately and transparently, not silently deducted here.
      v_net := v_amount;
      UPDATE public.talent_earnings
      SET gross_earning = v_amount,
          tax_withheld = 0,
          transfer_fee = 0,
          net_earning = v_net,
          allocated_payout_amount = 0,
          paid_out_amount = 0,
          status = 'available_for_payout'::public.talent_earning_status_type,
          status_before_dispute = NULL,
          available_at = NOW()
      WHERE id = v_earning.id;
    ELSE
      INSERT INTO public.talent_earnings (
        talent_id, booking_id, gross_earning, tax_withheld, transfer_fee,
        net_earning, status, entry_type, available_at
      ) VALUES (
        v_booking.talent_id, v_booking.id, v_amount, 0, 0, v_amount,
        'available_for_payout'::public.talent_earning_status_type,
        'earning'::public.ledger_entry_type, NOW()
      );
    END IF;

    -- This cancellation compensation is paid entirely to Talent; YUKU takes
    -- no 20% commission and no referral reward on this retained amount.
    UPDATE public.commission_records
    SET platform_commission_amount = 0,
        talent_gross_share = v_amount,
        referral_payout_reserved = 0,
        net_platform_revenue = 0
    WHERE booking_id = v_booking.id;

    UPDATE public.referral_rewards
    SET status = 'cancelled_disputed'::public.referral_reward_status_type,
        status_before_dispute = NULL
    WHERE booking_id = v_booking.id;

    INSERT INTO public.customer_cancellation_case_decisions
      (case_id, admin_user_id, decision, amount, admin_notes)
    VALUES (p_case_id, auth.uid(), p_decision, v_amount, trim(p_admin_notes))
    RETURNING id INTO v_decision_id;

    UPDATE public.customer_cancellation_cases
    SET status = 'resolved', admin_decision = 'compensate_talent',
        admin_notes = trim(p_admin_notes), admin_hold_until = NULL, resolved_by_admin_id = auth.uid(), resolved_at = NOW()
    WHERE id = p_case_id;
  END IF;

  INSERT INTO public.admin_audit_logs (
    admin_user_id, action_type, target_table, target_id, old_data, new_data
  ) VALUES (
    auth.uid(), 'resolve_customer_cancellation_case', 'customer_cancellation_cases', p_case_id::TEXT,
    jsonb_build_object('status', v_case.status, 'retained_amount', v_amount),
    jsonb_build_object('decision', p_decision, 'amount', v_amount,
      'decision_id', v_decision_id, 'provider_refund_id', p_provider_refund_id,
      'hold_until', p_hold_until, 'admin_notes', trim(p_admin_notes))
  );

  RETURN jsonb_build_object(
    'success', TRUE, 'case_id', p_case_id, 'decision_id', v_decision_id,
    'decision', p_decision, 'amount', v_amount,
    'status', CASE WHEN p_decision = 'extend_hold' THEN 'pending_admin_review' ELSE 'resolved' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_customer_cancellation_case(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_customer_cancellation_case(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;

COMMENT ON FUNCTION public.admin_resolve_customer_cancellation_case(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) IS
'Admin-only resolution of retained Customer cancellation funds. Refund requires an external provider refund already completed and its reference; Talent compensation allocates 100% of retained amount with zero YUKU commission; extend_hold leaves the case pending. Must be tested in staging.';
