-- ============================================================================
-- YUKU MIGRATION 24: HOLD TALENT EARNINGS WHILE CUSTOMER CANCELLATION IS
-- PENDING ADMIN REVIEW
-- Apply only after migrations 01-23 in a disposable/staging project.
-- This migration does not transfer, refund, or allocate money.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_booking_refund_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_earning public.talent_earnings%ROWTYPE;
  v_retained_amount BIGINT := 0;
  v_has_pending_case BOOLEAN := FALSE;
BEGIN
  IF NEW.status = 'disputed_hold'::public.booking_status_type THEN
    UPDATE public.talent_earnings
    SET status_before_dispute = COALESCE(status_before_dispute, status),
        status = 'disputed_hold'::public.talent_earning_status_type
    WHERE booking_id = NEW.id
      AND status <> 'disputed_hold'::public.talent_earning_status_type;

    UPDATE public.referral_rewards
    SET status_before_dispute = COALESCE(status_before_dispute, status),
        status = 'pending_completion'::public.referral_reward_status_type
    WHERE booking_id = NEW.id
      AND status_before_dispute IS NULL;

  ELSIF NEW.status = 'cancelled_by_customer'::public.booking_status_type THEN
    SELECT COALESCE(retained_pending_admin_amount, 0), TRUE
      INTO v_retained_amount, v_has_pending_case
    FROM public.customer_cancellation_cases
    WHERE booking_id = NEW.id
      AND status = 'pending_admin_review'
    FOR UPDATE;

    IF COALESCE(v_has_pending_case, FALSE) AND v_retained_amount > 0 THEN
      SELECT * INTO v_earning
      FROM public.talent_earnings
      WHERE booking_id = NEW.id
      FOR UPDATE;

      IF FOUND THEN
        -- Never silently cancel/reverse an earning that has already been
        -- reserved for payout or paid. The whole cancellation transaction
        -- must fail and be reviewed by Finance instead.
        IF v_earning.allocated_payout_amount > 0 OR v_earning.paid_out_amount > 0 THEN
          RAISE EXCEPTION 'Pembatalan ditahan: pendapatan Talent sudah dialokasikan atau dibayarkan. Perlu pemeriksaan Finance.';
        END IF;

        UPDATE public.talent_earnings
        SET status_before_dispute = COALESCE(status_before_dispute, status),
            status = 'disputed_hold'::public.talent_earning_status_type
        WHERE id = v_earning.id;
      END IF;

      -- Referral reward is not earned on a cancelled session. Keep it
      -- non-payable while the retained amount is under Admin review.
      UPDATE public.referral_rewards
      SET status_before_dispute = COALESCE(status_before_dispute, status),
          status = 'pending_completion'::public.referral_reward_status_type
      WHERE booking_id = NEW.id
        AND status_before_dispute IS NULL;

      RETURN NEW;
    END IF;

    -- No retained amount remains pending (e.g. unpaid or >24h full refund):
    -- apply the existing full cancellation reversal below.
    IF EXISTS (
      SELECT 1 FROM public.financial_adjustments_reversals
      WHERE booking_id = NEW.id
    ) THEN
      RETURN NEW;
    END IF;

    SELECT * INTO v_earning
    FROM public.talent_earnings
    WHERE booking_id = NEW.id
    FOR UPDATE;

    IF FOUND AND v_earning.status <> 'refund_adjusted'::public.talent_earning_status_type THEN
      IF v_earning.allocated_payout_amount > 0 OR v_earning.paid_out_amount > 0 THEN
        RAISE EXCEPTION 'Pembatalan tidak dapat membalik pendapatan yang sudah dialokasikan atau dibayarkan. Perlu pemeriksaan Finance.';
      END IF;

      UPDATE public.talent_earnings
      SET status = 'refund_adjusted'::public.talent_earning_status_type,
          status_before_dispute = NULL
      WHERE id = v_earning.id;

      INSERT INTO public.financial_adjustments_reversals (
        booking_id, talent_id, original_talent_earning_id, reversal_amount, reason
      ) VALUES (
        NEW.id, NEW.talent_id, v_earning.id, v_earning.net_earning,
        CONCAT('Reversal akibat status booking berubah menjadi: ', NEW.status)
      );

      UPDATE public.referral_rewards
      SET status = 'cancelled_disputed'::public.referral_reward_status_type,
          status_before_dispute = NULL
      WHERE booking_id = NEW.id;
    END IF;

  ELSIF NEW.status IN (
    'refunded'::public.booking_status_type,
    'cancelled_by_talent'::public.booking_status_type
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.financial_adjustments_reversals
      WHERE booking_id = NEW.id
    ) THEN
      RETURN NEW;
    END IF;

    SELECT * INTO v_earning
    FROM public.talent_earnings
    WHERE booking_id = NEW.id
    FOR UPDATE;

    IF FOUND AND v_earning.status <> 'refund_adjusted'::public.talent_earning_status_type THEN
      IF v_earning.allocated_payout_amount > 0 OR v_earning.paid_out_amount > 0 THEN
        RAISE EXCEPTION 'Pembatalan tidak dapat membalik pendapatan yang sudah dialokasikan atau dibayarkan. Perlu pemeriksaan Finance.';
      END IF;

      UPDATE public.talent_earnings
      SET status = 'refund_adjusted'::public.talent_earning_status_type,
          status_before_dispute = NULL
      WHERE id = v_earning.id;

      INSERT INTO public.financial_adjustments_reversals (
        booking_id, talent_id, original_talent_earning_id, reversal_amount, reason
      ) VALUES (
        NEW.id, NEW.talent_id, v_earning.id, v_earning.net_earning,
        CONCAT('Reversal akibat status booking berubah menjadi: ', NEW.status)
      );

      UPDATE public.referral_rewards
      SET status = 'cancelled_disputed'::public.referral_reward_status_type,
          status_before_dispute = NULL
      WHERE booking_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_booking_refund_financials() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.handle_booking_refund_financials() IS
'Prevents automatic Talent earning reversal while a Customer cancellation has retained funds pending Admin review. Pending earnings are non-payable (disputed_hold). It refuses cancellation if payout amounts have already been reserved or paid. No money movement is performed.';

-- Operational note: the existing booking trigger created by migration 21
-- continues to invoke this replacement function. Verify trigger attachment
-- in staging before enabling booking/cancellation features.
