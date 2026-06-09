-- Optional Supabase scheduled jobs. Requires pg_cron and pg_net extensions.
-- Weekly photo cleanup runs Sunday 15:00 UTC = Monday 00:00 Asia/Seoul.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Replace <PROJECT_REF> and <CRON_SECRET> before enabling.
-- SELECT cron.schedule(
--   'delete-expired-workout-photos',
--   '0 15 * * SUN',
--   $$
--   SELECT net.http_post(
--     url := 'https://<PROJECT_REF>.functions.supabase.co/cleanup-weekly-photos',
--     headers := jsonb_build_object('X-Cron-Secret', '<CRON_SECRET>')
--   );
--   $$
-- );
--
-- SELECT cron.schedule(
--   'delete-expired-workout-social-content',
--   '20 15 * * SUN',
--   $$
--   SELECT net.http_post(
--     url := 'https://<PROJECT_REF>.functions.supabase.co/cleanup-social-content',
--     headers := jsonb_build_object('X-Cron-Secret', '<CRON_SECRET>')
--   );
--   $$
-- );
