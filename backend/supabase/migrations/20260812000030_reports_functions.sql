-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Aggregate functions for reports.
--
-- PostgREST cannot SUM over a table, so money aggregates for reports run as
-- database functions. Counts are handled in the backend via count="exact".
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hms_sum_payments(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
    v numeric;
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v
      FROM payments
     WHERE status = 'completed'
       AND (p_from IS NULL OR payment_date >= p_from)
       AND (p_to IS NULL OR payment_date <= p_to);
    RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION hms_sum_expenses(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
    v numeric;
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v
      FROM expenses
     WHERE (p_from IS NULL OR expense_date >= p_from)
       AND (p_to IS NULL OR expense_date <= p_to);
    RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION hms_outstanding_balance()
RETURNS numeric
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
    v numeric;
BEGIN
    SELECT COALESCE(SUM(
        i.total_amount - COALESCE(
            (SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id AND p.status = 'completed'), 0
        )
    ), 0) INTO v
      FROM invoices i
     WHERE i.status IN ('issued', 'partially_paid', 'overdue');
    RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION hms_sum_payments(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION hms_sum_expenses(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION hms_outstanding_balance() TO service_role;
