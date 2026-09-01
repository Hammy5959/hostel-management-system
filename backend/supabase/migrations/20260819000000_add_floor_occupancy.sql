-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Per-floor room/bed capacity and occupancy aggregation.
--
-- Same shape and occupancy definition as hms_building_occupancy() (see
-- 20260818000000_add_building_type_and_occupancy.sql) — occupied beds are
-- `beds.status = 'occupied'`, the value the allocation RPCs (hms_allocate_bed
-- / hms_release_allocation / hms_transfer_allocation, see
-- 20260812000010_allocation_stay_functions.sql) keep authoritative — just
-- grouped one level down, by `rooms.floor_id` instead of `floors.building_id`.
--
-- Idempotent; safe to re-run. Apply via the Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hms_floor_occupancy(p_floor_id uuid DEFAULT NULL)
RETURNS TABLE (
    floor_id uuid,
    total_rooms bigint,
    total_capacity bigint,
    total_beds bigint,
    occupied_beds bigint
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT
        r.floor_id,
        COUNT(r.id) AS total_rooms,
        COALESCE(SUM(r.capacity), 0) AS total_capacity,
        COALESCE(SUM(bed_counts.bed_count), 0) AS total_beds,
        COALESCE(SUM(bed_counts.occupied_count), 0) AS occupied_beds
    FROM rooms r
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*) AS bed_count,
            COUNT(*) FILTER (WHERE b.status = 'occupied') AS occupied_count
        FROM beds b
        WHERE b.room_id = r.id
    ) bed_counts ON true
    WHERE p_floor_id IS NULL OR r.floor_id = p_floor_id
    GROUP BY r.floor_id;
$$;

GRANT EXECUTE ON FUNCTION hms_floor_occupancy(uuid) TO service_role;
