-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Add `password_hash` to the `users` table.
--
-- Enables password authentication (Argon2id) as the FIRST factor of a two-step
-- login: Email + Password -> OTP -> JWT. Only the Argon2id hash is stored —
-- plaintext passwords are never persisted.
--
--   * The column is nullable so existing rows (which have no password yet) are
--     NOT deleted or altered; they simply cannot log in until an administrator
--     sets a password for them. The seeder sets the initial password for the
--     bootstrap `super_admin` user (see app/seed/run.py).
--   * `service_role` (the backend) already holds table-level DML grants, which
--     cover new columns; the GRANT below re-asserts them idempotently for
--     defense-in-depth.
--
-- Idempotent (PG supports ADD COLUMN IF NOT EXISTS); safe to re-run.
-- Apply via the Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash TEXT;

COMMENT ON COLUMN public.users.password_hash
    IS 'Argon2id hash of the user password. Never stores plaintext.';

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO service_role;
