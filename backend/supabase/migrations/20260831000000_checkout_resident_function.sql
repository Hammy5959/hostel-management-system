-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Atomic resident checkout: releases the resident's active room
-- allocation, frees the bed, and marks the resident checked_out, all inside a
-- single locking transaction. Mirrors hms_release_allocation's shape (same
-- FOR UPDATE locking pattern) plus the residents.status side effect that
-- function deliberately never performs.
--
-- Apply via the Supabase Dashboard -> SQL Editor (runs as `postgres`).
-- Idempotent (CREATE OR REPLACE).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hms_checkout_resident(
    p_resident_id uuid,
    p_reason text DEFAULT NULL
)
RETURNS SETOF residents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resident residents;
    v_alloc room_allocations;
BEGIN
    SELECT * INTO v_resident FROM residents WHERE id = p_resident_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'resident_not_found';
    END IF;
    IF v_resident.status NOT IN ('active', 'on_leave') THEN
        RAISE EXCEPTION 'resident_not_checkoutable';
    END IF;

    SELECT * INTO v_alloc FROM room_allocations
     WHERE resident_id = p_resident_id AND status = 'active'
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no_active_allocation';
    END IF;

    UPDATE room_allocations
       SET status = 'completed', allocated_until = CURRENT_DATE,
           reason = COALESCE(p_reason, reason), updated_at = now()
     WHERE id = v_alloc.id;

    UPDATE beds SET status = 'available', updated_at = now() WHERE id = v_alloc.bed_id;

    RETURN QUERY
    UPDATE residents SET status = 'checked_out', updated_at = now()
     WHERE id = p_resident_id
     RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION hms_checkout_resident(uuid, text) TO service_role;
