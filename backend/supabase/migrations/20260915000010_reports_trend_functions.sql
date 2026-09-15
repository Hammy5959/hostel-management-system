-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Time-series trend functions for reports.
--
-- No historical bed-status snapshot table exists in this schema (beds.status
-- is current-state only), so hms_trend_occupancy approximates occupancy per
-- period via resident_stays (check_in_at / actual_check_out_at) rather than a
-- true point-in-time reconstruction — see function comment below for the
-- documented limitation on total_beds.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hms_trend_collections(
    p_from date DEFAULT NULL,
    p_to date DEFAULT NULL,
    p_granularity text DEFAULT 'month'
)
RETURNS TABLE (period date, total numeric)
LANGUAGE sql STABLE
SET search_path = public
AS $$
    SELECT
        date_trunc(p_granularity, payment_date)::date AS period,
        COALESCE(SUM(amount), 0) AS total
    FROM payments
    WHERE status = 'completed'
      AND (p_from IS NULL OR payment_date >= p_from)
      AND (p_to IS NULL OR payment_date <= p_to)
    GROUP BY period
    ORDER BY period;
$$;

-- Occupancy trend, approximated from resident_stays — there is no historical
-- bed-count/bed-status table, so `total_beds` on every period row is the
-- CURRENT total bed count (a simplifying assumption, not a true historical
-- denominator). `occupied_beds` per period = stays whose check-in falls on or
-- before the period end and whose (still-open or later) check-out falls on
-- or after the period start.
CREATE OR REPLACE FUNCTION hms_trend_occupancy(
    p_from date,
    p_to date,
    p_granularity text DEFAULT 'month'
)
RETURNS TABLE (period date, occupied_beds bigint, total_beds bigint, occupancy_rate numeric)
LANGUAGE sql STABLE
SET search_path = public
AS $$
    WITH periods AS (
        SELECT generate_series(
            date_trunc(p_granularity, p_from),
            date_trunc(p_granularity, p_to),
            ('1 ' || p_granularity)::interval
        )::date AS period_start
    ),
    bounded AS (
        SELECT
            period_start,
            (period_start + ('1 ' || p_granularity)::interval - interval '1 day')::date AS period_end
        FROM periods
    ),
    current_total AS (
        SELECT COUNT(*)::bigint AS total_beds FROM beds
    )
    SELECT
        b.period_start AS period,
        COUNT(s.id)::bigint AS occupied_beds,
        ct.total_beds,
        ROUND(
            CASE WHEN ct.total_beds > 0 THEN COUNT(s.id)::numeric / ct.total_beds * 100 ELSE 0 END,
            2
        ) AS occupancy_rate
    FROM bounded b
    CROSS JOIN current_total ct
    LEFT JOIN resident_stays s
        ON s.check_in_at::date <= b.period_end
       AND (s.actual_check_out_at IS NULL OR s.actual_check_out_at::date >= b.period_start)
    GROUP BY b.period_start, ct.total_beds
    ORDER BY b.period_start;
$$;

GRANT EXECUTE ON FUNCTION hms_trend_collections(date, date, text) TO service_role;
GRANT EXECUTE ON FUNCTION hms_trend_occupancy(date, date, text) TO service_role;
