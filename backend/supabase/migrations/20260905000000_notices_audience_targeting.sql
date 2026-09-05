-- Adds optional audience targeting to notices (app.notices.service), so a
-- notice can be aimed at everyone (default, unchanged behavior) or narrowed
-- to a single building or floor. Checked in app.notices.service.list_notices
-- / get / set_published (the last of these to decide who gets auto-notified
-- when a notice is published).
--
-- audience_type defaults to 'all' with both target columns NULL, so every
-- existing notice keeps its current (everyone-visible) behavior unchanged.
--
-- Idempotent; safe to re-run. Apply via the Supabase Dashboard → SQL Editor.
ALTER TABLE notices ADD COLUMN IF NOT EXISTS audience_type text NOT NULL DEFAULT 'all'
  CHECK (audience_type IN ('all', 'building', 'floor'));
ALTER TABLE notices ADD COLUMN IF NOT EXISTS audience_building_id uuid REFERENCES buildings(id);
ALTER TABLE notices ADD COLUMN IF NOT EXISTS audience_floor_id uuid REFERENCES floors(id);
