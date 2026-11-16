-- ============================================================================
-- YUKU MIGRATION 21: BOOKING ACTOR GUARDS & TWO-PARTY COMPLETION
-- Prevents either participant from unilaterally advancing privileged states.
-- A booking completes only after both customer and talent confirm the session.
-- ============================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS talent_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_before_dispute public.booking_status_type;

ALTER TABLE public.talent_earnings
  ADD COLUMN IF NOT EXISTS status_before_dispute public.talent_earning_status_type;
ALTER TABLE public.referral_rewards
  ADD COLUMN IF NOT EXISTS status_before_dispute public.referral_reward_status_type;

-- Existing completed records are grandfathered as mutually confirmed because
-- the old application had only one completion action. Review historical data.
UPDATE public.bookings
SET customer_completed_at = COALESCE(customer_completed_at, completion_confirmed_at, updated_at),
    talent_completed_at = COALESCE(talent_completed_at, completion_confirmed_at, updated_at)
WHERE status = 'completed'::public.booking_status_type;

CREATE OR REPLACE FUNCTION public.guard_booking_status_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled_by_customer'::public.booking_status_type THEN
    IF v_actor IS NULL OR v_actor <> OLD.customer_id THEN
      RAISE EXCEPTION 'Hanya Customer pemesan yang dapat membatalkan booking sebagai cancelled_by_customer.';
    END IF;

  ELSIF NEW.status = 'cancelled_by_talent'::public.booking_status_type THEN
    IF v_actor IS NULL OR v_actor <> OLD.talent_id THEN
      RAISE EXCEPTION 'Hanya Talent pemilik booking yang dapat membatalkan booking sebagai cancelled_by_talent.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.refunds rf
      WHERE rf.booking_id = OLD.id
        AND rf.customer_id = OLD.customer_id
        AND rf.refund_amount >= OLD.gross_amount
        AND rf.status = 'requested'::public.refund_status_type
    ) THEN
      RAISE EXCEPTION 'Pembatalan Talent harus membuat permintaan refund penuh terlebih dahulu.';
    END IF;

  ELSIF NEW.status IN (
    'confirmed_by_talent'::public.booking_status_type,
    'in_progress'::public.booking_status_type
  ) THEN
    IF v_actor IS NULL OR v_actor <> OLD.talent_id THEN
      RAISE EXCEPTION 'Hanya Talent pemilik booking yang dapat mengubah status sesi ini.';
    END IF;

  ELSIF NEW.status = 'completed'::public.booking_status_type THEN
    IF NEW.customer_completed_at IS NULL OR NEW.talent_completed_at IS NULL THEN
      RAISE EXCEPTION 'Booking hanya dapat selesai setelah Customer dan Talent sama-sama mengonfirmasi sesi.';
    END IF;

  ELSIF NEW.status = 'disputed_hold'::public.booking_status_type THEN
    IF v_actor IS NULL OR v_actor NOT IN (OLD.customer_id, OLD.talent_id) THEN
      RAISE EXCEPTION 'Hanya peserta booking atau Admin yang dapat menahan booking karena sengketa.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.reports_complaints rc
      WHERE rc.booking_id = OLD.id
        AND rc.status IN ('open'::public.report_status_type, 'investigating'::public.report_status_type)
    ) THEN
      RAISE EXCEPTION 'Booking hanya dapat ditahan jika ada laporan sengketa aktif.';
    END IF;

  ELSIF NEW.status IN (
    'paid_held_in_escrow'::public.booking_status_type,
    'refunded'::public.booking_status_type,
    'expired'::public.booking_status_type
  ) THEN
    RAISE EXCEPTION 'Perubahan status ini hanya boleh dilakukan backend pembayaran atau Admin.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_booking_status_actor ON public.bookings;
CREATE TRIGGER trg_guard_booking_status_actor
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.guard_booking_status_actor();
REVOKE ALL ON FUNCTION public.guard_booking_status_actor() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.confirm_booking_completion(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_booking public.bookings%ROWTYPE;
  v_status public.booking_status_type;
  v_waiting_for TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking tidak ditemukan.';
  END IF;

  IF v_booking.status <> 'in_progress'::public.booking_status_type THEN
    RAISE EXCEPTION 'Hanya sesi yang sedang berlangsung yang dapat dikonfirmasi selesai.';
  END IF;

  IF v_actor NOT IN (v_booking.customer_id, v_booking.talent_id) THEN
    RAISE EXCEPTION 'Anda bukan peserta booking ini.';
  END IF;

  UPDATE public.bookings
  SET customer_completed_at = CASE
        WHEN v_actor = v_booking.customer_id THEN COALESCE(customer_completed_at, NOW())
        ELSE customer_completed_at
      END,
      talent_completed_at = CASE
        WHEN v_actor = v_booking.talent_id THEN COALESCE(talent_completed_at, NOW())
        ELSE talent_completed_at
      END,
      status = CASE
        WHEN (v_actor = v_booking.customer_id OR v_booking.customer_completed_at IS NOT NULL)
         AND (v_actor = v_booking.talent_id OR v_booking.talent_completed_at IS NOT NULL)
          THEN 'completed'::public.booking_status_type
        ELSE 'in_progress'::public.booking_status_type
      END,
      updated_at = NOW()
  WHERE id = p_booking_id
  RETURNING status INTO v_status;

  IF v_status = 'completed'::public.booking_status_type THEN
    v_waiting_for := NULL;
  ELSIF v_actor = v_booking.customer_id THEN
    v_waiting_for := 'talent';
  ELSE
    v_waiting_for := 'customer';
  END IF;

  RETURN jsonb_build_object(
    'booking_id', p_booking_id,
    'status', v_status,
    'waiting_for', v_waiting_for,
    'completed', (v_status = 'completed'::public.booking_status_type)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_booking_completion(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_booking_completion(UUID) TO authenticated;

-- Reports tied to a booking must come from one of its participants and name
-- the other participant. An open report automatically places the booking on hold.
CREATE OR REPLACE FUNCTION public.validate_booking_report_and_hold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF NEW.booking_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = NEW.booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking laporan tidak ditemukan.';
  END IF;

  IF NEW.reporter_id = v_booking.customer_id THEN
    IF NEW.reported_user_id <> v_booking.talent_id THEN
      RAISE EXCEPTION 'Reported user tidak sesuai dengan peserta booking.';
    END IF;
  ELSIF NEW.reporter_id = v_booking.talent_id THEN
    IF NEW.reported_user_id <> v_booking.customer_id THEN
      RAISE EXCEPTION 'Reported user tidak sesuai dengan peserta booking.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Hanya peserta booking yang dapat membuat laporan terkait booking ini.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.hold_booking_when_reported()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.booking_id IS NOT NULL AND NEW.status IN (
    'open'::public.report_status_type,
    'investigating'::public.report_status_type
  ) THEN
    UPDATE public.bookings
    SET status_before_dispute = COALESCE(status_before_dispute, status),
        status = 'disputed_hold'::public.booking_status_type,
        updated_at = NOW()
    WHERE id = NEW.booking_id
      AND status IN (
        'paid_held_in_escrow'::public.booking_status_type,
        'confirmed_by_talent'::public.booking_status_type,
        'in_progress'::public.booking_status_type,
        'completed'::public.booking_status_type
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_booking_report_and_hold ON public.reports_complaints;
CREATE TRIGGER trg_validate_booking_report_and_hold
BEFORE INSERT ON public.reports_complaints
FOR EACH ROW EXECUTE FUNCTION public.validate_booking_report_and_hold();

DROP TRIGGER IF EXISTS trg_hold_booking_when_reported ON public.reports_complaints;
CREATE TRIGGER trg_hold_booking_when_reported
AFTER INSERT ON public.reports_complaints
FOR EACH ROW EXECUTE FUNCTION public.hold_booking_when_reported();

-- Preserve pre-dispute earning/reward states so an Admin resolution restores
-- the correct financial state (held, available, partially paid, or paid out).
CREATE OR REPLACE FUNCTION public.handle_booking_refund_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_earning RECORD;
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

  ELSIF NEW.status IN (
    'refunded'::public.booking_status_type,
    'cancelled_by_customer'::public.booking_status_type,
    'cancelled_by_talent'::public.booking_status_type
  ) THEN
    IF EXISTS (SELECT 1 FROM public.financial_adjustments_reversals WHERE booking_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    SELECT * INTO v_earning
    FROM public.talent_earnings
    WHERE booking_id = NEW.id
    FOR UPDATE;

    IF FOUND AND v_earning.status <> 'refund_adjusted'::public.talent_earning_status_type THEN
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

REVOKE ALL ON FUNCTION public.validate_booking_report_and_hold() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hold_booking_when_reported() FROM PUBLIC, anon, authenticated;



-- Replace the earlier report resolver so resolved disputes can safely restore
-- the pre-dispute booking state only when no other active report remains.
CREATE OR REPLACE FUNCTION public.admin_resolve_report(
  p_report_id UUID,
  p_new_status public.report_status_type,
  p_admin_notes TEXT DEFAULT NULL,
  p_hold_booking BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_report public.reports_complaints%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya Admin YUKU yang dapat memproses laporan.';
  END IF;

  SELECT * INTO v_report
  FROM public.reports_complaints
  WHERE id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Laporan insiden tidak ditemukan.';
  END IF;

  UPDATE public.reports_complaints
  SET status = p_new_status,
      admin_notes = NULLIF(trim(COALESCE(p_admin_notes, '')), ''),
      resolved_by_admin_id = auth.uid()
  WHERE id = p_report_id;

  IF v_report.booking_id IS NOT NULL THEN
    IF p_hold_booking THEN
      UPDATE public.bookings
      SET status_before_dispute = COALESCE(status_before_dispute, status),
          status = 'disputed_hold'::public.booking_status_type,
          updated_at = NOW()
      WHERE id = v_report.booking_id
        AND status IN (
          'paid_held_in_escrow'::public.booking_status_type,
          'confirmed_by_talent'::public.booking_status_type,
          'in_progress'::public.booking_status_type,
          'completed'::public.booking_status_type
        );
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.reports_complaints rc
      WHERE rc.booking_id = v_report.booking_id
        AND rc.status IN ('open'::public.report_status_type, 'investigating'::public.report_status_type)
    ) THEN
      UPDATE public.bookings
      SET status = status_before_dispute,
          status_before_dispute = NULL,
          updated_at = NOW()
      WHERE id = v_report.booking_id
        AND status = 'disputed_hold'::public.booking_status_type
        AND status_before_dispute IS NOT NULL;

      UPDATE public.talent_earnings
      SET status = COALESCE(status_before_dispute, 'held_in_escrow'::public.talent_earning_status_type),
          status_before_dispute = NULL
      WHERE booking_id = v_report.booking_id
        AND status = 'disputed_hold'::public.talent_earning_status_type;

      UPDATE public.referral_rewards
      SET status = COALESCE(status_before_dispute, 'pending_completion'::public.referral_reward_status_type),
          status_before_dispute = NULL
      WHERE booking_id = v_report.booking_id
        AND status_before_dispute IS NOT NULL;
    END IF;
  END IF;

  INSERT INTO public.admin_audit_logs (
    admin_user_id, action_type, target_table, target_id, old_data, new_data
  ) VALUES (
    auth.uid(),
    'admin_resolve_report',
    'reports_complaints',
    p_report_id::TEXT,
    jsonb_build_object('status', v_report.status, 'admin_notes', v_report.admin_notes),
    jsonb_build_object('status', p_new_status, 'admin_notes', p_admin_notes, 'hold_booking', p_hold_booking)
  );

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_report(UUID, public.report_status_type, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(UUID, public.report_status_type, TEXT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.confirm_booking_completion(UUID) IS
'Each booking participant confirms completion once. Booking transitions to completed only after both parties confirm.';

-- A payout that has reserved earnings cannot be marked complete while any
-- underlying earning is on dispute hold.
CREATE OR REPLACE FUNCTION public.guard_payout_completion_during_dispute()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.payout_status = 'completed_provider_confirmed'::public.payout_status_type
     AND OLD.payout_status IS DISTINCT FROM NEW.payout_status
     AND EXISTS (
       SELECT 1
       FROM public.payout_earnings_allocations pea
       JOIN public.talent_earnings te ON te.id = pea.talent_earning_id
       WHERE pea.payout_request_id = NEW.id
         AND pea.status = 'reserved'::public.payout_allocation_status_type
         AND te.status = 'disputed_hold'::public.talent_earning_status_type
     ) THEN
    RAISE EXCEPTION 'Pencairan ditahan karena terdapat penghasilan yang sedang dalam sengketa.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_payout_completion_during_dispute ON public.payout_requests;
CREATE TRIGGER trg_guard_payout_completion_during_dispute
BEFORE UPDATE ON public.payout_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_payout_completion_during_dispute();
REVOKE ALL ON FUNCTION public.guard_payout_completion_during_dispute() FROM PUBLIC, anon, authenticated;
