-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Enable pg_cron so scheduled SQL jobs (starting with the on_leave
-- status transitions job) can run inside Postgres itself, no external
-- scheduler needed.
--
-- Apply via the Supabase Dashboard -> SQL Editor (runs as `postgres`).
-- Idempotent (create extension if not exists).
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
