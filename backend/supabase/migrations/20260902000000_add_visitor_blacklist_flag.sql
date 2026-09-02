-- Adds an is_blacklisted flag to visitors, checked at check-in time
-- (app.visitor_logs.service.check_in) to block a blacklisted guest from
-- being let in. Defaults false so every existing visitor row is unaffected.
--
-- Idempotent; safe to re-run. Apply via the Supabase Dashboard → SQL Editor.
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS is_blacklisted boolean NOT NULL DEFAULT false;
