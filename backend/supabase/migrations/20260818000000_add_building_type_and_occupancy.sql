-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Building type + per-building capacity/occupancy aggregation.
--
-- Adds a `type` column (boys/girls/mixed) to `buildings`, driving the
-- Buildings UI's Type badge. Adds `hms_building_occupancy()`, a table-valued
-- function returning per-building room count, bed capacity and occupancy —
-- mirrors the existing `reports.occupancy` pattern (occupied/total beds,
-- see 20260812000030_reports_functions.sql) but scoped per building via
-- floors → rooms → beds, since PostgREST cannot GROUP BY across a join.
--
-- Idempotent; safe to re-run. Apply via the Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'building_type') THEN
        CREATE TYPE building_type AS ENUM ('boys', 'girls', 'mixed');
    END IF;
END$$;

ALTER TABLE buildings
    ADD COLUMN IF NOT EXISTS type building_type NOT NULL DEFAULT 'mixed';

-- Per-building room/bed capacity and occupancy. `p_building_id` narrows to a
-- single building (used by the building detail endpoint); NULL returns all
-- buildings that have at least one room (used by the list endpoint, joined
-- in application code so buildings with zero rooms still show up as 0/0).
CREATE OR REPLACE FUNCTION hms_building_occupancy(p_building_id uuid DEFAULT NULL)
RETURNS TABLE (
    building_id uuid,
    total_rooms bigint,
    total_capacity bigint,
    total_beds bigint,
    occupied_beds bigint
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT
        f.building_id,
        COUNT(r.id) AS total_rooms,
        COALESCE(SUM(r.capacity), 0) AS total_capacity,
        COALESCE(SUM(bed_counts.bed_count), 0) AS total_beds,
        COALESCE(SUM(bed_counts.occupied_count), 0) AS occupied_beds
    FROM floors f
    JOIN rooms r ON r.floor_id = f.id
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*) AS bed_count,
            COUNT(*) FILTER (WHERE b.status = 'occupied') AS occupied_count
        FROM beds b
        WHERE b.room_id = r.id
    ) bed_counts ON true
    WHERE p_building_id IS NULL OR f.building_id = p_building_id
    GROUP BY f.building_id;
$$;

GRANT EXECUTE ON FUNCTION hms_building_occupancy(uuid) TO service_role;
