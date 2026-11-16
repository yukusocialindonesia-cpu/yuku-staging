ALTER TABLE public.booking_status_history ADD COLUMN IF NOT EXISTS actor_type VARCHAR(20) NOT NULL DEFAULT 'user';
ALTER TABLE public.booking_status_history ALTER COLUMN changed_by_user_id DROP NOT NULL;
DO $$ BEGIN
  ALTER TABLE public.booking_status_history ADD CONSTRAINT booking_status_history_actor_type_check CHECK (actor_type IN ('user','system','admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.booking_status_history ADD CONSTRAINT booking_status_history_actor_consistency_check CHECK ((actor_type = 'system' AND changed_by_user_id IS NULL) OR (actor_type IN ('user','admin') AND changed_by_user_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.bookings TO authenticated;
GRANT INSERT (booking_code, customer_id, talent_id, activity_category_id, booking_mode, start_time, end_time, duration_hours, meeting_location_name, meeting_location_address, status) ON public.bookings TO authenticated;
GRANT UPDATE (status, cancellation_reason, updated_at) ON public.bookings TO authenticated;
GRANT SELECT ON public.booking_status_history TO authenticated;
GRANT INSERT (booking_id, previous_status, new_status, changed_by_user_id, notes, actor_type) ON public.booking_status_history TO authenticated;
GRANT INSERT, DELETE ON public.talent_services TO authenticated;
ALTER TYPE public.payment_provider_type ADD VALUE IF NOT EXISTS 'simulation';
