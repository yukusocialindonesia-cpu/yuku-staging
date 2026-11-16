-- YUKU MIGRATION 33: schedule automatic escrow release.
-- process_escrow_release() existed (migration 20) but nothing invoked it,
-- so completed bookings stayed held_in_escrow forever.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('release-escrow-completed-bookings')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'release-escrow-completed-bookings');
END $$;

SELECT cron.schedule(
  'release-escrow-completed-bookings',
  '* * * * *',
  $$select public.process_escrow_release()$$
);
