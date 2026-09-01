-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Transaction-critical RPC functions for bed allocation, transfer,
-- check-in and check-out.
--
-- WHY: these flows touch several tables (allocation + bed + resident + stay)
-- and a bed is a shared resource. Doing them across HTTP calls would leave
-- windows for partial updates and double-booking. Each function runs in a
-- single transaction and locks the shared rows with SELECT ... FOR UPDATE,
-- which serializes concurrent operators.
--
-- Apply alongside 20260812000000_restore_service_role_grants.sql via the
-- Supabase Dashboard → SQL Editor (runs as `postgres`). Idempotent.
-- SECURITY DEFINER runs as the definer (postgres) so the backend's
-- service_role can invoke them; search_path is pinned to public.
-- ─────────────────────────────────────────────────────────────────────────────

-- Bed allocation ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION hms_allocate_bed(
    p_resident_id uuid,
    p_room_id uuid,
    p_bed_id uuid,
    p_admission_id uuid DEFAULT NULL,
    p_allocated_from date DEFAULT CURRENT_DATE,
    p_allocated_until date DEFAULT NULL,
    p_reason text DEFAULT NULL,
    p_allocated_by uuid DEFAULT NULL
)
RETURNS SETOF room_allocations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bed RECORD;
    v_lock uuid;
BEGIN
    -- Serialize on the resident to prevent a second concurrent allocation.
    SELECT id INTO v_lock FROM residents WHERE id = p_resident_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'resident_not_found';
    END IF;

    -- Lock the bed row: this is what makes concurrent allocation safe.
    SELECT * INTO v_bed FROM beds WHERE id = p_bed_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'bed_not_found';
    END IF;
    IF v_bed.status = 'occupied' THEN
        RAISE EXCEPTION 'bed_occupied';
    END IF;
    IF v_bed.room_id <> p_room_id THEN
        RAISE EXCEPTION 'bed_room_mismatch';
    END IF;

    IF EXISTS (
        SELECT 1 FROM room_allocations
        WHERE resident_id = p_resident_id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'resident_already_allocated';
    END IF;

    IF p_admission_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM admissions WHERE id = p_admission_id AND status = 'approved'
    ) THEN
        RAISE EXCEPTION 'admission_not_approved';
    END IF;

    RETURN QUERY
    INSERT INTO room_allocations
        (resident_id, room_id, bed_id, admission_id, allocated_from, allocated_until, status, reason, allocated_by)
    VALUES
        (p_resident_id, p_room_id, p_bed_id, p_admission_id, p_allocated_from, p_allocated_until, 'active', p_reason, p_allocated_by)
    RETURNING *;

    UPDATE beds SET status = 'occupied', updated_at = now() WHERE id = p_bed_id;
END;
$$;

-- Transfer an active allocation to a new bed -----------------------------------
CREATE OR REPLACE FUNCTION hms_transfer_allocation(
    p_allocation_id uuid,
    p_new_bed_id uuid,
    p_new_room_id uuid,
    p_reason text DEFAULT NULL,
    p_transferred_by uuid DEFAULT NULL
)
RETURNS SETOF room_allocations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_alloc room_allocations;
    v_new_bed RECORD;
    v_old_bed RECORD;
BEGIN
    SELECT * INTO v_alloc FROM room_allocations WHERE id = p_allocation_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'allocation_not_found';
    END IF;
    IF v_alloc.status <> 'active' THEN
        RAISE EXCEPTION 'allocation_not_active';
    END IF;

    SELECT * INTO v_new_bed FROM beds WHERE id = p_new_bed_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'bed_not_found';
    END IF;
    IF v_new_bed.status = 'occupied' THEN
        RAISE EXCEPTION 'bed_occupied';
    END IF;
    IF v_new_bed.room_id <> p_new_room_id THEN
        RAISE EXCEPTION 'bed_room_mismatch';
    END IF;
    IF v_new_bed.id = v_alloc.bed_id THEN
        RAISE EXCEPTION 'same_bed';
    END IF;

    SELECT * INTO v_old_bed FROM beds WHERE id = v_alloc.bed_id FOR UPDATE;

    UPDATE room_allocations
       SET status = 'transferred', allocated_until = CURRENT_DATE, updated_at = now()
     WHERE id = p_allocation_id;

    -- Release old bed, claim new bed, create the new active allocation.
    UPDATE beds SET status = 'available', updated_at = now() WHERE id = v_old_bed.id;
    UPDATE beds SET status = 'occupied', updated_at = now() WHERE id = v_new_bed.id;

    RETURN QUERY
    INSERT INTO room_allocations
        (resident_id, room_id, bed_id, admission_id, allocated_from, allocated_until, status, reason, allocated_by)
    VALUES
        (v_alloc.resident_id, p_new_room_id, p_new_bed_id, v_alloc.admission_id, CURRENT_DATE, v_alloc.allocated_until, 'active', p_reason, p_transferred_by)
    RETURNING *;
END;
$$;

-- Check-in ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hms_check_in(
    p_stay_id uuid,
    p_check_in_by uuid DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS SETOF resident_stays
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stay resident_stays;
    v_alloc RECORD;
    v_bed RECORD;
BEGIN
    SELECT * INTO v_stay FROM resident_stays WHERE id = p_stay_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'stay_not_found';
    END IF;
    IF v_stay.status <> 'scheduled' THEN
        RAISE EXCEPTION 'stay_not_scheduled';
    END IF;
    IF EXISTS (
        SELECT 1 FROM resident_stays
        WHERE resident_id = v_stay.resident_id AND status = 'checked_in'
    ) THEN
        RAISE EXCEPTION 'stay_already_checked_in';
    END IF;

    SELECT * INTO v_alloc FROM room_allocations WHERE id = v_stay.allocation_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'allocation_not_found';
    END IF;
    IF v_alloc.status <> 'active' THEN
        RAISE EXCEPTION 'allocation_not_active';
    END IF;

    SELECT * INTO v_bed FROM beds WHERE id = v_alloc.bed_id FOR UPDATE;
    IF v_bed.status <> 'occupied' THEN
        RAISE EXCEPTION 'bed_not_occupied';
    END IF;

    RETURN QUERY
    UPDATE resident_stays
       SET status = 'checked_in', check_in_at = now(), check_in_by = p_check_in_by, check_in_notes = p_notes, updated_at = now()
     WHERE id = p_stay_id
     RETURNING *;

    UPDATE residents SET status = 'active', updated_at = now() WHERE id = v_stay.resident_id;
END;
$$;

-- Check-out --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hms_check_out(
    p_stay_id uuid,
    p_check_out_by uuid DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS SETOF resident_stays
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stay resident_stays;
    v_alloc RECORD;
    v_bed RECORD;
BEGIN
    SELECT * INTO v_stay FROM resident_stays WHERE id = p_stay_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'stay_not_found';
    END IF;
    IF v_stay.status <> 'checked_in' THEN
        RAISE EXCEPTION 'stay_not_checked_in';
    END IF;

    SELECT * INTO v_alloc FROM room_allocations WHERE id = v_stay.allocation_id FOR UPDATE;
    SELECT * INTO v_bed FROM beds WHERE id = v_alloc.bed_id FOR UPDATE;

    -- Close the stay.
    RETURN QUERY
    UPDATE resident_stays
       SET status = 'checked_out', actual_check_out_at = now(), check_out_by = p_check_out_by, check_out_notes = p_notes, updated_at = now()
     WHERE id = p_stay_id
     RETURNING *;

    -- Close the allocation and release the bed.
    UPDATE room_allocations
       SET status = 'completed', allocated_until = CURRENT_DATE, updated_at = now()
     WHERE id = v_alloc.id;
    UPDATE beds SET status = 'available', updated_at = now() WHERE id = v_bed.id;
    UPDATE residents SET status = 'checked_out', updated_at = now() WHERE id = v_stay.resident_id;
END;
$$;

-- Release an allocation (no stay involved) -------------------------------------
CREATE OR REPLACE FUNCTION hms_release_allocation(
    p_allocation_id uuid,
    p_reason text DEFAULT NULL
)
RETURNS SETOF room_allocations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_alloc room_allocations;
BEGIN
    SELECT * INTO v_alloc FROM room_allocations WHERE id = p_allocation_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'allocation_not_found';
    END IF;
    IF v_alloc.status <> 'active' THEN
        RAISE EXCEPTION 'allocation_not_active';
    END IF;

    UPDATE room_allocations
       SET status = 'completed', allocated_until = CURRENT_DATE,
           reason = COALESCE(p_reason, reason), updated_at = now()
     WHERE id = p_allocation_id;

    UPDATE beds SET status = 'available', updated_at = now() WHERE id = v_alloc.bed_id;

    RETURN QUERY SELECT * FROM room_allocations WHERE id = p_allocation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION hms_allocate_bed(uuid, uuid, uuid, uuid, date, date, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION hms_transfer_allocation(uuid, uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION hms_check_in(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION hms_check_out(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION hms_release_allocation(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION hms_transfer_allocation(uuid, uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION hms_check_in(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION hms_check_out(uuid, uuid, text) TO service_role;
