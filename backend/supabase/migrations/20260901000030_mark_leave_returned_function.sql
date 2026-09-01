-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Manual early-return: a scheduled job can't know a resident came back
-- before their leave's end_date, so staff flip them back to active via this
-- function. Modeled directly on hms_checkout_resident's locking pattern.
--
-- Sets actual_return_date on the covering approved leave (its own status
-- stays 'approved' — it genuinely was, and happened) so
-- hms_apply_leave_status_transitions never re-flips this resident back to
-- on_leave on its next run.
--
-- Apply via the Supabase Dashboard -> SQL Editor (runs as `postgres`).
-- Idempotent (CREATE OR REPLACE).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hms_mark_leave_returned(
    p_resident_id uuid,
    p_marked_by uuid DEFAULT NULL
)
RETURNS SETOF residents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resident residents;
    v_leave leave_requests;
    v_today date := (now() AT TIME ZONE 'Asia/Karachi')::date;
BEGIN
    SELECT * INTO v_resident FROM residents WHERE id = p_resident_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'resident_not_found';
    END IF;
    IF v_resident.status <> 'on_leave' THEN
        RAISE EXCEPTION 'resident_not_on_leave';
    END IF;

    SELECT * INTO v_leave FROM leave_requests
     WHERE resident_id = p_resident_id
       AND status = 'approved'
       AND actual_return_date IS NULL
       AND start_date <= v_today
       AND end_date   >= v_today
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no_covering_leave';
    END IF;

    UPDATE leave_requests SET actual_return_date = v_today, updated_at = now() WHERE id = v_leave.id;

    RETURN QUERY
    UPDATE residents SET status = 'active', updated_at = now()
     WHERE id = p_resident_id
     RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION hms_mark_leave_returned(uuid, uuid) TO service_role;
