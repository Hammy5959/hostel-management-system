-- ─────────────────────────────────────────────────────────────────────────────
-- HMS — Payments Step 2: when a payment makes an invoice fully paid, every
-- resident_charge linked to that invoice (still 'invoiced') flips to 'paid'
-- too, in the same transaction as the payment insert + invoice status update.
--
-- Deliberately invoice-level only — no per-charge amount_paid distribution.
-- A partial payment (invoice -> partially_paid) leaves linked charges
-- untouched at 'invoiced'; they only flip once the invoice is fully paid.
-- Charges an admin already moved to 'waived'/'cancelled' are never touched —
-- the `status = 'invoiced'` guard excludes anything else.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hms_record_payment(
    p_resident_id uuid,
    p_invoice_id uuid,
    p_payment_reference text,
    p_amount numeric,
    p_payment_method text DEFAULT NULL,
    p_transaction_reference text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_received_by uuid DEFAULT NULL
)
RETURNS SETOF payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice RECORD;
    v_paid numeric;
    v_payment_id uuid;
BEGIN
    SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invoice_not_found';
    END IF;
    IF v_invoice.status IN ('draft', 'cancelled') THEN
        RAISE EXCEPTION 'invoice_not_issuable';
    END IF;
    IF v_invoice.resident_id <> p_resident_id THEN
        RAISE EXCEPTION 'invoice_resident_mismatch';
    END IF;
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'payment_amount_invalid';
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_paid
      FROM payments
     WHERE invoice_id = p_invoice_id AND status = 'completed';

    IF v_paid + p_amount > v_invoice.total_amount THEN
        RAISE EXCEPTION 'payment_exceeds_balance';
    END IF;

    INSERT INTO payments
        (resident_id, invoice_id, payment_reference, amount, payment_method, payment_date, status, transaction_reference, notes, received_by)
    VALUES
        (p_resident_id, p_invoice_id, p_payment_reference, p_amount, p_payment_method, now(), 'completed', p_transaction_reference, p_notes, p_received_by)
    RETURNING id INTO v_payment_id;

    v_paid := v_paid + p_amount;
    UPDATE invoices
       SET status = CASE WHEN v_paid >= v_invoice.total_amount THEN 'paid'::invoice_status ELSE 'partially_paid'::invoice_status END,
           updated_at = now()
     WHERE id = p_invoice_id;

    IF v_paid >= v_invoice.total_amount THEN
        UPDATE resident_charges
           SET status = 'paid', updated_at = now()
         WHERE invoice_id = p_invoice_id AND status = 'invoiced';
    END IF;

    RETURN QUERY SELECT * FROM payments WHERE id = v_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION hms_record_payment(uuid, uuid, text, numeric, text, text, text, uuid) TO service_role;
