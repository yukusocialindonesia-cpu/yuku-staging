-- ============================================================================
-- YUKU MIGRATION 20: IMMEDIATE ESCROW AVAILABILITY AFTER COMPLETION
-- Aligns implementation with the approved YUKU business policy:
-- balance is available immediately after session completion unless disputed/held.
-- Apply AFTER migrations 01-19 in staging and test with real fixture data.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_booking_completion_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'completed'::public.booking_status_type
     AND OLD.status IS DISTINCT FROM 'completed'::public.booking_status_type THEN
    IF NEW.completion_confirmed_at IS NULL THEN
      NEW.completion_confirmed_at := NOW();
    END IF;
    -- No automatic 24-hour holding period in the approved YUKU policy.
    NEW.escrow_release_scheduled_at := NEW.completion_confirmed_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_booking_completion_timestamps ON public.bookings;
CREATE TRIGGER trg_set_booking_completion_timestamps
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.set_booking_completion_timestamps();

-- Existing completed bookings inherit immediate availability from their recorded
-- completion timestamp. Active disputes remain held by process_escrow_release().
UPDATE public.bookings
SET escrow_release_scheduled_at = COALESCE(completion_confirmed_at, updated_at, end_time, NOW())
WHERE status = 'completed'::public.booking_status_type
  AND escrow_release_scheduled_at IS DISTINCT FROM COALESCE(completion_confirmed_at, updated_at, end_time, NOW());

CREATE OR REPLACE FUNCTION public.process_escrow_release()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INT := 0;
  v_rec RECORD;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin')
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak: pelepasan escrow hanya untuk backend tepercaya.';
  END IF;

  FOR v_rec IN
    SELECT b.id AS booking_id
    FROM public.bookings b
    WHERE b.status = 'completed'::public.booking_status_type
      AND COALESCE(b.escrow_release_scheduled_at, b.completion_confirmed_at) <= NOW()
      AND NOT EXISTS (
        SELECT 1
        FROM public.reports_complaints rc
        WHERE rc.booking_id = b.id
          AND rc.status IN ('open'::public.report_status_type, 'investigating'::public.report_status_type)
      )
    FOR UPDATE OF b SKIP LOCKED
  LOOP
    UPDATE public.talent_earnings
    SET status = 'available_for_payout'::public.talent_earning_status_type,
        available_at = COALESCE(available_at, NOW())
    WHERE booking_id = v_rec.booking_id
      AND status = 'held_in_escrow'::public.talent_earning_status_type;

    UPDATE public.referral_rewards
    SET status = 'credited'::public.referral_reward_status_type,
        credited_at = COALESCE(credited_at, NOW())
    WHERE booking_id = v_rec.booking_id
      AND status = 'pending_completion'::public.referral_reward_status_type;

    UPDATE public.payments
    SET escrow_released_at = COALESCE(escrow_released_at, NOW()),
        payment_status = 'released_to_talent'::public.payment_status_type,
        updated_at = NOW()
    WHERE booking_id = v_rec.booking_id
      AND payment_status = 'settled_held'::public.payment_status_type;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.process_escrow_release() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_escrow_release() TO service_role;

COMMENT ON FUNCTION public.process_escrow_release() IS
'Releases completed booking escrow immediately when scheduled and no open/investigating dispute exists. Must be invoked by a trusted scheduled backend/service_role.';
