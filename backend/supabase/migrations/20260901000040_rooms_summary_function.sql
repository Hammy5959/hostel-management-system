-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Global room-level occupancy summary for the Rooms page stat cards.
--
-- Mirrors hms_building_occupancy() / hms_floor_occupancy() (see
-- 20260818000000_add_building_type_and_occupancy.sql and
-- 20260819000000_add_floor_occupancy.sql) — same LEFT JOIN LATERAL on `beds`
-- per room, same `beds.status = 'occupied'` definition of occupied (the value
-- the allocation RPCs hms_allocate_bed / hms_release_allocation /
-- hms_transfer_allocation keep authoritative) — but ungrouped (a single
-- global row, not per building/floor) and counting ROOMS, not beds:
--
--   total_rooms     = count(rooms)
--   occupied_rooms  = rooms with >= 1 occupied bed
--   available_rooms = rooms with >= 1 free (non-occupied) bed — NOTE a
--                      partially-filled room counts as BOTH occupied and
--                      available; that's intentional.
--   full_rooms      = rooms where occupied_beds = total_beds AND total_beds > 0
--                      (a room with zero beds configured is neither full nor
--                      available)
--
-- Idempotent; safe to re-run. Apply via the Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hms_rooms_summary()
RETURNS TABLE (
    total_rooms bigint,
    occupied_rooms bigint,
    available_rooms bigint,
    full_rooms bigint
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT
        COUNT(r.id) AS total_rooms,
        COUNT(*) FILTER (WHERE bed_counts.occupied_count > 0) AS occupied_rooms,
        COUNT(*) FILTER (
            WHERE bed_counts.bed_count > 0
              AND bed_counts.occupied_count < bed_counts.bed_count
        ) AS available_rooms,
        COUNT(*) FILTER (
            WHERE bed_counts.bed_count > 0
              AND bed_counts.occupied_count = bed_counts.bed_count
        ) AS full_rooms
    FROM rooms r
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*) AS bed_count,
            COUNT(*) FILTER (WHERE b.status = 'occupied') AS occupied_count
        FROM beds b
        WHERE b.room_id = r.id
    ) bed_counts ON true;
$$;

GRANT EXECUTE ON FUNCTION hms_rooms_summary() TO service_role;
