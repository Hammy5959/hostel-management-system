-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Track early returns from leave separately from the leave's own
-- status. A resident marked "returned" before their approved leave's
-- end_date keeps that leave's status = 'approved' (it genuinely was, and
-- happened) — actual_return_date is the signal that stops
-- hms_apply_leave_status_transitions from treating this leave as still
-- covering today, so a manually-returned resident is never re-flipped back
-- to on_leave by the next scheduled run.
--
-- Apply via the Supabase Dashboard -> SQL Editor (runs as `postgres`).
-- Idempotent. Nullable, no default — every existing row becomes NULL
-- ("not manually ended early"), which is the correct reading for all
-- current data; no backfill needed.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS actual_return_date date;
