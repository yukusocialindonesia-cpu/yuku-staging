-- ============================================================================
-- MIGRATION 11: VALIDASI ULASAN PASCA-SESI & SINKRONISASI RATING TALENT
-- Aman dijalankan ulang (Idempoten).
-- ============================================================================

-- 1. Validasi sebelum INSERT ke public.reviews:
--    - Booking harus ada, milik customer_id pengirim, untuk talent_id terkait
--    - Status booking wajib 'completed'
CREATE OR REPLACE FUNCTION public.validate_review_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT id, customer_id, talent_id, status
  INTO v_booking
  FROM public.bookings
  WHERE id = NEW.booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking tidak ditemukan untuk ulasan ini.';
  END IF;

  IF v_booking.customer_id <> NEW.customer_id OR v_booking.talent_id <> NEW.talent_id THEN
    RAISE EXCEPTION 'Data customer atau talent tidak cocok dengan reservasi booking.';
  END IF;

  IF v_booking.status <> 'completed' THEN
    RAISE EXCEPTION 'Ulasan hanya dapat diberikan setelah sesi booking berstatus selesai (completed).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_review_insert ON public.reviews;
CREATE TRIGGER trg_validate_review_insert
  BEFORE INSERT ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_review_insert();

-- 2. Sinkronisasi rating_average & review_count ke public.talent_profiles
CREATE OR REPLACE FUNCTION public.sync_talent_rating_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_talent_id UUID;
BEGIN
  v_talent_id := COALESCE(NEW.talent_id, OLD.talent_id);

  UPDATE public.talent_profiles tp
  SET
    rating_average = COALESCE((
      SELECT ROUND(AVG(r.rating)::numeric, 2)
      FROM public.reviews r
      WHERE r.talent_id = v_talent_id
        AND r.is_visible = TRUE
    ), 0),
    review_count = COALESCE((
      SELECT COUNT(*)::int
      FROM public.reviews r
      WHERE r.talent_id = v_talent_id
        AND r.is_visible = TRUE
    ), 0),
    updated_at = NOW()
  WHERE tp.id = v_talent_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_talent_rating_stats ON public.reviews;
CREATE TRIGGER trg_sync_talent_rating_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_talent_rating_stats();
