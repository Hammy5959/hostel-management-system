-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Add 'cleaning' to the bed_status enum.
--
-- WHY: the Room Bed Management page distinguishes a bed that is between
-- residents and being turned over (cleaning) from a bed that is simply
-- available. Staff move a bed into/out of this state manually via the
-- existing PATCH /beds/{id} endpoint — no allocation/checkout RPC changes.
--
-- Apply via the Supabase Dashboard → SQL Editor (runs as `postgres`).
-- Idempotent. Must run outside the same transaction as any use of the new
-- value — this file contains only the ALTER TYPE statement, so a normal
-- single-statement apply is safe.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE bed_status ADD VALUE IF NOT EXISTS 'cleaning' AFTER 'occupied';
