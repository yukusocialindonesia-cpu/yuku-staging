-- YUKU MIGRATION 34: allow paid bookings to be cancelled by the customer.
-- request_customer_cancellation() (migration 23) moves paid_held_in_escrow /
-- confirmed_by_talent -> cancelled_by_customer, but validate_booking_update()
-- (migration 06) rejected that transition. Only the transition rules change.
CREATE OR REPLACE FUNCTION public.validate_booking_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    IF NEW.hourly_rate_snapshot IS DISTINCT FROM OLD.hourly_rate_snapshot OR
       NEW.gross_amount IS DISTINCT FROM OLD.gross_amount OR
       NEW.platform_fee_amount IS DISTINCT FROM OLD.platform_fee_amount OR
       NEW.talent_gross_share IS DISTINCT FROM OLD.talent_gross_share OR
       NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
       NEW.talent_id IS DISTINCT FROM OLD.talent_id OR
       NEW.activity_category_id IS DISTINCT FROM OLD.activity_category_id THEN
      RAISE EXCEPTION 'Akses Ditolak: Rincian finansial dan relasi booking tidak dapat diubah.';
    END IF;

    IF OLD.status IN ('paid_held_in_escrow'::public.booking_status_type, 'confirmed_by_talent'::public.booking_status_type, 'in_progress'::public.booking_status_type, 'completed'::public.booking_status_type) THEN
      IF NEW.start_time IS DISTINCT FROM OLD.start_time OR
         NEW.end_time IS DISTINCT FROM OLD.end_time OR
         NEW.duration_hours IS DISTINCT FROM OLD.duration_hours OR
         NEW.meeting_location_name IS DISTINCT FROM OLD.meeting_location_name OR
         NEW.meeting_location_address IS DISTINCT FROM OLD.meeting_location_address THEN
        RAISE EXCEPTION 'Akses Ditolak: Jadwal dan lokasi booking yang telah dibayar tidak dapat diubah sepihak.';
      END IF;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status = 'pending_payment'::public.booking_status_type AND NEW.status NOT IN ('paid_held_in_escrow'::public.booking_status_type, 'cancelled_by_customer'::public.booking_status_type, 'expired'::public.booking_status_type) THEN
        RAISE EXCEPTION 'Transisi status tidak valid dari % ke %', OLD.status, NEW.status;
      ELSIF OLD.status = 'paid_held_in_escrow'::public.booking_status_type AND NEW.status NOT IN ('confirmed_by_talent'::public.booking_status_type, 'cancelled_by_talent'::public.booking_status_type, 'cancelled_by_customer'::public.booking_status_type, 'disputed_hold'::public.booking_status_type, 'refunded'::public.booking_status_type) THEN
        RAISE EXCEPTION 'Transisi status tidak valid dari % ke %', OLD.status, NEW.status;
      ELSIF OLD.status = 'confirmed_by_talent'::public.booking_status_type AND NEW.status NOT IN ('in_progress'::public.booking_status_type, 'cancelled_by_talent'::public.booking_status_type, 'cancelled_by_customer'::public.booking_status_type, 'disputed_hold'::public.booking_status_type, 'refunded'::public.booking_status_type) THEN
        RAISE EXCEPTION 'Transisi status tidak valid dari % ke %', OLD.status, NEW.status;
      ELSIF OLD.status = 'in_progress'::public.booking_status_type AND NEW.status NOT IN ('completed'::public.booking_status_type, 'disputed_hold'::public.booking_status_type) THEN
        RAISE EXCEPTION 'Transisi status tidak valid dari % ke %', OLD.status, NEW.status;
      ELSIF OLD.status = 'completed'::public.booking_status_type AND NEW.status NOT IN ('disputed_hold'::public.booking_status_type) THEN
        RAISE EXCEPTION 'Transisi status tidak valid dari % ke %', OLD.status, NEW.status;
      ELSIF OLD.status IN ('refunded'::public.booking_status_type, 'cancelled_by_customer'::public.booking_status_type, 'cancelled_by_talent'::public.booking_status_type, 'expired'::public.booking_status_type) THEN
        RAISE EXCEPTION 'Booking yang sudah selesai/batal tidak dapat diubah statusnya.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
