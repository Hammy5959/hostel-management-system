-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Automatic active <-> on_leave resident status transitions, driven by
-- approved leave_requests dates. Runs hourly via pg_cron; every run is a
-- pure re-evaluation of "what should be true right now" against dates, not a
-- diff against a prior run, so a missed run self-corrects on the next one.
--
-- "Today" is computed via AT TIME ZONE 'Asia/Karachi', not CURRENT_DATE —
-- pg_cron's own clock is UTC by default and we don't want the transition to
-- depend on the cluster's ambient timezone setting. Asia/Karachi (PKT,
-- UTC+5) has no DST, so the cron schedule's UTC time never needs to drift.
--
-- Job A only ever touches residents.status = 'active' rows; Job B only ever
-- touches 'on_leave' rows — a checked_out/applicant/inactive resident is
-- never matched by either UPDATE's WHERE clause, by construction.
--
-- actual_return_date IS NULL in both queries is what excludes a
-- manually-returned leave (see hms_mark_leave_returned) from still counting
-- as "covering" a date, so Job A never re-flips an early-returned resident
-- back to on_leave.
--
-- Apply via the Supabase Dashboard -> SQL Editor (runs as `postgres`).
-- Idempotent (CREATE OR REPLACE + cron.schedule upserts by job name).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hms_apply_leave_status_transitions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
BEGIN
    -- Job A: active -> on_leave.
    UPDATE residents r
       SET status = 'on_leave', updated_at = now()
     WHERE r.status = 'active'
       AND EXISTS (
         SELECT 1 FROM leave_requests l
          WHERE l.resident_id = r.id
            AND l.status = 'approved'
            AND l.actual_return_date IS NULL
            AND l.start_date <= v_today
            AND l.end_date   >= v_today
       );

    -- Job B: on_leave -> active.
    UPDATE residents r
       SET status = 'active', updated_at = now()
     WHERE r.status = 'on_leave'
       AND NOT EXISTS (
         SELECT 1 FROM leave_requests l
          WHERE l.resident_id = r.id
            AND l.status = 'approved'
            AND l.actual_return_date IS NULL
            AND l.start_date <= v_today
            AND l.end_date   >= v_today
       );
END;
$$;

GRANT EXECUTE ON FUNCTION hms_apply_leave_status_transitions() TO postgres;

-- Runs at 5 minutes past every hour. Hourly rather than once daily: the
-- function is cheap and fully idempotent, so extra runs cost nothing, and it
-- shrinks the worst-case delay for a transition to ~1h instead of ~24h if a
-- particular run is skipped or has a transient issue.
SELECT cron.schedule(
  'leave-status-transitions',
  '5 * * * *',
  $$ SELECT hms_apply_leave_status_transitions(); $$
);
