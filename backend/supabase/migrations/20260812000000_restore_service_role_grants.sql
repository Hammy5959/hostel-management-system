-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Restore standard Supabase grants to the `service_role` role.
--
-- WHY: the 39 public tables were created with RLS enabled but WITHOUT the usual
-- Supabase default privileges. `service_role` (used by the backend via the
-- secret key) currently holds only `Dxtm` (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN)
-- and lacks SELECT/INSERT/UPDATE/DELETE, so every API query fails with:
--   permission denied for table <name>
--
-- This restores the Supabase default for the backend's own role. It does NOT
-- weaken RLS — service_role already bypasses RLS by design; RLS still protects
-- anon/authenticated access.
--
-- Apply once via the Supabase Dashboard → SQL Editor (runs as `postgres`).
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Also restore standard DML grants to anon/authenticated so any future
-- client-side reads through RLS policies work as Supabase intends.
-- (The backend does NOT use these roles; this is for completeness.)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
