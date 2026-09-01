-- Makes an approved admission mandatory for bed allocation. Previously
-- hms_allocate_bed only validated admission_id when the caller happened to
-- pass one, so allocating with admission_id = NULL silently skipped the
-- check entirely. This closes that gap and adds two more safety nets: the
-- admission must belong to the resident being allocated, and it must not
-- already have been consumed by a prior allocation (each admission maps to
-- at most one allocation lifecycle).
--
-- Apply via the Supabase Dashboard -> SQL Editor (runs as `postgres`).
-- Idempotent (CREATE OR REPLACE), same signature as the original function
-- in 20260812000010_allocation_stay_functions.sql.
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

    IF p_admission_id IS NULL THEN
        RAISE EXCEPTION 'admission_required';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM admissions
        WHERE id = p_admission_id AND status = 'approved' AND resident_id = p_resident_id
    ) THEN
        RAISE EXCEPTION 'admission_not_approved';
    END IF;

    IF EXISTS (
        SELECT 1 FROM room_allocations WHERE admission_id = p_admission_id
    ) THEN
        RAISE EXCEPTION 'admission_already_used';
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
