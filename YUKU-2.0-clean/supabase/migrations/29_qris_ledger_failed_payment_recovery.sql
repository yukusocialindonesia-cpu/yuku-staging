-- YUKU migration 29: ensure QRIS approval creates every ledger row exactly once,
-- including when an existing payment row was previously marked failed.
-- This migration replaces the legacy trigger function; it does not alter
-- historical payment rows or automatically settle any payment.

CREATE OR REPLACE FUNCTION public.auto_generate_booking_financial_ledgers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_referral_rel public.referral_relationships%ROWTYPE;
  v_has_referral BOOLEAN := FALSE;
  v_referral_reward_amount BIGINT := 0;
BEGIN
  -- Only process a newly settled payment or an allowed transition into
  -- settled_held. OLD is not read for INSERT operations.
  IF NEW.payment_status <> 'settled_held'::public.payment_status_type THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.payment_status NOT IN (
       'pending'::public.payment_status_type,
       'failed'::public.payment_status_type
     ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = NEW.booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking % tidak ditemukan untuk pembuatan ledger.', NEW.booking_id;
  END IF;

  SELECT * INTO v_referral_rel
  FROM public.referral_relationships
  WHERE referee_talent_id = v_booking.talent_id
    AND is_active = TRUE
  ORDER BY created_at ASC
  LIMIT 1;
  v_has_referral := FOUND;

  IF v_has_referral THEN
    v_referral_reward_amount := ROUND(v_booking.platform_fee_amount * 0.10);
  END IF;

  -- Independent idempotent inserts repair a partially-created ledger too;
  -- one existing row must not prevent the other ledger rows from being made.
  INSERT INTO public.commission_records (
    booking_id, gross_booking_amount, platform_commission_amount,
    talent_gross_share, referral_payout_reserved, net_platform_revenue
  ) VALUES (
    v_booking.id, v_booking.gross_amount, v_booking.platform_fee_amount,
    v_booking.talent_gross_share, v_referral_reward_amount,
    v_booking.platform_fee_amount - v_referral_reward_amount
  ) ON CONFLICT (booking_id) DO NOTHING;

  INSERT INTO public.talent_earnings (
    talent_id, booking_id, gross_earning, tax_withheld, transfer_fee,
    net_earning, status, entry_type
  ) VALUES (
    v_booking.talent_id, v_booking.id, v_booking.talent_gross_share, 0, 0,
    v_booking.talent_gross_share,
    'held_in_escrow'::public.talent_earning_status_type,
    'earning'::public.ledger_entry_type
  ) ON CONFLICT (booking_id) DO NOTHING;

  IF v_has_referral AND v_referral_reward_amount > 0 THEN
    INSERT INTO public.referral_rewards (
      referral_relationship_id, booking_id, referrer_id,
      platform_commission_base, reward_amount, status
    ) VALUES (
      v_referral_rel.id, v_booking.id, v_referral_rel.referrer_id,
      v_booking.platform_fee_amount, v_referral_reward_amount,
      'pending_completion'::public.referral_reward_status_type
    ) ON CONFLICT (booking_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_generate_booking_financial_ledgers ON public.payments;
CREATE TRIGGER trg_auto_generate_booking_financial_ledgers
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.auto_generate_booking_financial_ledgers();

COMMENT ON FUNCTION public.auto_generate_booking_financial_ledgers() IS
'Creates commission, talent earning, and referral ledger rows idempotently when a payment enters settled_held from pending/failed or is inserted already settled. Migration 29.';
