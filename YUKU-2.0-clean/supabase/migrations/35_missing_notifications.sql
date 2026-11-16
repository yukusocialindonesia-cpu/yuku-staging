-- YUKU MIGRATION 35: notifications that were missing in the money flow.
--  1. Customer: QRIS payment proof rejected
--  2. Customer: refund processed
--  3. Talent: compensation credited after a customer cancellation
--  4. Fix stale text: talent no longer waits 24h (immediate escrow release, migration 20)
-- Uses the existing public.create_in_app_notification(); no table or UI changes.

CREATE OR REPLACE FUNCTION public.notify_qris_proof_rejected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF NEW.status::TEXT = 'rejected' AND OLD.status::TEXT IS DISTINCT FROM 'rejected' THEN
    SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
    IF FOUND THEN
      PERFORM public.create_in_app_notification(
        v_booking.customer_id,
        'Bukti Pembayaran Ditolak',
        'Bukti pembayaran booking ' || v_booking.booking_code || ' ditolak Admin. Alasan: ' || COALESCE(NULLIF(NEW.admin_notes, ''), 'tidak disebutkan') || '. Silakan unggah bukti yang benar sebelum batas waktu.',
        'payment_status'::public.notification_type,
        jsonb_build_object('booking_id', v_booking.id, 'booking_code', v_booking.booking_code, 'route', '/riwayat-booking')
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_qris_proof_rejected ON public.qris_payment_submissions;
CREATE TRIGGER trg_notify_qris_proof_rejected
AFTER UPDATE ON public.qris_payment_submissions
FOR EACH ROW EXECUTE FUNCTION public.notify_qris_proof_rejected();

CREATE OR REPLACE FUNCTION public.notify_refund_processed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code TEXT;
BEGIN
  IF NEW.status::TEXT = 'processed' AND OLD.status::TEXT IS DISTINCT FROM 'processed' THEN
    SELECT booking_code INTO v_code FROM public.bookings WHERE id = NEW.booking_id;
    PERFORM public.create_in_app_notification(
      NEW.customer_id,
      'Refund Telah Diproses',
      'Refund Rp ' || replace(to_char(NEW.refund_amount, 'FM999,999,999,999'), ',', '.') || ' untuk booking ' || COALESCE(v_code, '') || ' telah dikembalikan.',
      'payment_status'::public.notification_type,
      jsonb_build_object('booking_id', NEW.booking_id, 'booking_code', v_code, 'route', '/riwayat-booking')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_refund_processed ON public.refunds;
CREATE TRIGGER trg_notify_refund_processed
AFTER UPDATE ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.notify_refund_processed();

CREATE OR REPLACE FUNCTION public.notify_talent_compensation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF FOUND AND v_booking.status = 'cancelled_by_customer'::public.booking_status_type THEN
    PERFORM public.create_in_app_notification(
      NEW.talent_id,
      'Kompensasi Pembatalan Diterima',
      'Anda menerima kompensasi Rp ' || replace(to_char(NEW.net_earning, 'FM999,999,999,999'), ',', '.') || ' dari booking ' || v_booking.booking_code || ' yang dibatalkan Customer. Saldo sudah masuk ke dashboard Anda.',
      'payout_status'::public.notification_type,
      jsonb_build_object('booking_id', v_booking.id, 'booking_code', v_booking.booking_code, 'route', '/dashboard-talent')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_talent_compensation ON public.talent_earnings;
CREATE TRIGGER trg_notify_talent_compensation
AFTER INSERT ON public.talent_earnings
FOR EACH ROW EXECUTE FUNCTION public.notify_talent_compensation();

-- Stale text fix (idempotent: replace does nothing if the old text is gone).
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'notify_on_booking_status_change';
  IF v_def IS NOT NULL AND position('masa tunggu 24 jam' IN v_def) > 0 THEN
    EXECUTE replace(v_def, 'Kompensasi 80% akan tersedia setelah masa tunggu 24 jam.', 'Kompensasi 80% akan tersedia untuk dicairkan setelah dana dilepas dari escrow.');
  END IF;
END $$;
