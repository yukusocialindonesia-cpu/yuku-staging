-- Run once in Supabase SQL Editor after enabling the pg_cron extension.
-- The job checks every minute; funds become available on the next run after
-- completion, provided no open/investigating report exists.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('yuku-escrow-release', 'yuku_release_escrow_24h');

SELECT cron.schedule(
  'yuku-escrow-release',
  '* * * * *',
  $$SELECT public.process_escrow_release();$$
);
