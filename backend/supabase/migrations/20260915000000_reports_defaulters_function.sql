-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Per-resident outstanding-balance rollup for the Defaulters report.
--
-- "Defaulter" = a resident with at least one invoice in ('issued',
-- 'partially_paid') whose due_date has passed (same overdue definition used
-- by app.invoices.service.get_earliest_outstanding_invoice_by_resident and
-- fixed into reports.finance()'s overdue_invoices count — invoices.status =
-- 'overdue' is never actually set by any code path).
--
-- total_outstanding sums the balance (total_amount - completed payments,
-- same correlated-subquery shape as hms_outstanding_balance, see
-- 20260812000030_reports_functions.sql) across ALL of that resident's
-- outstanding invoices, not just the overdue ones, to give the full picture.
-- oldest_overdue_date is the earliest due_date among the OVERDUE ones only.
--
-- room_number/bed_number come from the resident's current active
-- room_allocations row (LEFT JOIN — a defaulter without a live allocation,
-- e.g. already checked out with unpaid dues, still appears, with NULLs).
--
-- Idempotent; safe to re-run. Apply via the Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hms_defaulters()
RETURNS TABLE (
    resident_id uuid,
    first_name text,
    last_name text,
    student_id text,
    room_number text,
    bed_number text,
    total_outstanding numeric,
    oldest_overdue_date date
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
    WITH invoice_balances AS (
        SELECT
            i.resident_id,
            i.due_date,
            i.total_amount - COALESCE(
                (SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id AND p.status = 'completed'), 0
            ) AS balance
        FROM invoices i
        WHERE i.status IN ('issued', 'partially_paid')
    ),
    per_resident AS (
        SELECT
            resident_id,
            SUM(balance) AS total_outstanding,
            MIN(due_date) FILTER (WHERE due_date < CURRENT_DATE) AS oldest_overdue_date
        FROM invoice_balances
        GROUP BY resident_id
    )
    SELECT
        r.id AS resident_id,
        r.first_name,
        r.last_name,
        r.student_id,
        ra.room_number,
        ra.bed_number,
        pr.total_outstanding,
        pr.oldest_overdue_date
    FROM per_resident pr
    JOIN residents r ON r.id = pr.resident_id
    LEFT JOIN LATERAL (
        SELECT rm.room_number, b.bed_number
        FROM room_allocations al
        JOIN rooms rm ON rm.id = al.room_id
        LEFT JOIN beds b ON b.id = al.bed_id
        WHERE al.resident_id = pr.resident_id AND al.status = 'active'
        LIMIT 1
    ) ra ON true
    WHERE pr.oldest_overdue_date IS NOT NULL
    ORDER BY pr.oldest_overdue_date ASC;
$$;

GRANT EXECUTE ON FUNCTION hms_defaulters() TO service_role;
