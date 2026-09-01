-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Add 'deleted' to the user_status enum.
--
-- Enables production-safe SOFT DELETE / ARCHIVE of user accounts:
--   DELETE /users/{id} sets status = 'deleted' (never a physical DELETE),
--   preserving staff/resident links, financial history and audit records.
-- 'deleted' users are excluded from authentication (BLOCKED_STATUSES).
--
-- Idempotent (PG 12+ supports ADD VALUE IF NOT EXISTS); safe to re-run.
-- Apply via the Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'deleted';
