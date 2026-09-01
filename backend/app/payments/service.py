"""Payment business logic.

Recording a payment is atomic with the invoice balance update (see the
hms_record_payment database function): a payment can never exceed the allowed
invoice balance and the invoice status flips to paid/partially_paid in the same
transaction.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from supabase import Client

from app.audit.service import record_audit
from app.common.authz import has_permission
from app.common.numbers import generate_number
from app.core.exceptions import ForbiddenError
from app.database.crud import list_page
from app.database.rpc import rpc_call
from app.database.supabase import raise_for_error
from app.notifications.service import notify_resident
from app.payments.schemas import PaymentCreate, PaymentList, PaymentOut, PaymentSummaryOut
from app.residents.service import get_resident_by_user

_TABLE = "payments"
# Aliased so embed keys match the schema's singular ref fields — mirrors
# app.invoices.service._SELECT. Each FK (resident_id, invoice_id, received_by)
# points at a distinct table, so PostgREST needs no constraint disambiguation.
_SELECT = (
    "*, resident:residents(id, first_name, last_name, student_id, profile_picture_url), "
    "invoice:invoices(id, invoice_number), "
    "received_by_user:users(id, first_name, last_name)"
)

_ERR_MAP = {
    "invoice_not_found": (404, "invoice_not_found", "Invoice not found"),
    "invoice_not_issuable": (400, "invoice_not_issuable", "This invoice is not payable (draft or cancelled)"),
    "invoice_resident_mismatch": (400, "invoice_resident_mismatch", "Invoice does not belong to this resident"),
    "payment_amount_invalid": (400, "payment_amount_invalid", "Payment amount must be positive"),
    "payment_exceeds_balance": (400, "payment_exceeds_balance", "Payment exceeds the outstanding invoice balance"),
}


def record_payment(db: Client, user: dict, data: PaymentCreate) -> PaymentOut:
    rows = rpc_call(db, "hms_record_payment", {
        "p_resident_id": str(data.resident_id),
        "p_invoice_id": str(data.invoice_id),
        "p_payment_reference": data.payment_reference or generate_number("PAY"),
        "p_amount": str(data.amount),
        "p_payment_method": data.payment_method,
        "p_transaction_reference": data.transaction_reference,
        "p_notes": data.notes,
        "p_received_by": user["id"],
    }, _ERR_MAP)
    payment = PaymentOut.model_validate(rows[0])
    record_audit(
        db,
        user_id=user["id"],
        action="payment.create",
        module="payments",
        entity_type="payment",
        entity_id=str(payment.id),
        description=f"Recorded payment {payment.payment_reference} of {payment.amount}",
        new_values={"amount": str(payment.amount), "invoice_id": str(payment.invoice_id)},
    )
    notify_resident(
        db,
        str(payment.resident_id),
        title="Payment received",
        message=f"A payment of {payment.amount} was recorded against invoice {payment.invoice_id}.",
        reference_type="payment",
        reference_id=str(payment.id),
    )
    return payment


def _resolve_resident_search(db: Client, search: str) -> list[str]:
    """Resolve a resident-name search term to matching resident ids — same
    full-name matching rule as app.invoices.service._resolve_resident_search."""
    needle = search.lower()
    res = db.table("residents").select("id, first_name, last_name").execute()
    if getattr(res, "error", None):
        raise_for_error(res, "search residents")
    matches = []
    for r in res.data or []:
        full_name = f"{r['first_name']} {r.get('last_name') or ''}".strip().lower()
        if needle in full_name:
            matches.append(r["id"])
    return matches


def _resolve_invoice_number_search(db: Client, search: str) -> list[str]:
    """Resolve an invoice-number search term to matching invoice ids, so a
    payment can be found by the invoice it's against."""
    res = db.table("invoices").select("id").ilike("invoice_number", f"%{search}%").execute()
    if getattr(res, "error", None):
        raise_for_error(res, "search invoices")
    return [r["id"] for r in res.data or []]


def _sum_amount(rows: list[dict]) -> Decimal:
    return sum((Decimal(str(r["amount"])) for r in rows), Decimal("0"))


def _compute_summary(db: Client) -> PaymentSummaryOut:
    """Global totals for the Payments page stat cards — always unfiltered by
    the current list's search/filters, mirroring how InvoiceSummaryOut is
    computed in app.invoices.service.list_invoices."""
    res = db.table(_TABLE).select("amount", count="exact").eq("status", "completed").execute()
    if getattr(res, "error", None):
        raise_for_error(res, "sum payments")
    total_collected = _sum_amount(res.data or [])
    total_payments = int(res.count or 0)

    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    res_month = (
        db.table(_TABLE).select("amount").eq("status", "completed")
        .gte("payment_date", month_start.isoformat()).execute()
    )
    if getattr(res_month, "error", None):
        raise_for_error(res_month, "sum payments this month")
    this_month = _sum_amount(res_month.data or [])

    inv_res = db.table("invoices").select("id, total_amount").in_("status", ["issued", "partially_paid", "overdue"]).execute()
    if getattr(inv_res, "error", None):
        raise_for_error(inv_res, "sum open invoices")
    inv_rows = inv_res.data or []
    invoice_ids = [r["id"] for r in inv_rows]
    total_billed = sum((Decimal(str(r["total_amount"])) for r in inv_rows), Decimal("0"))
    paid_against_open = Decimal("0")
    if invoice_ids:
        pay_res = db.table(_TABLE).select("amount").eq("status", "completed").in_("invoice_id", invoice_ids).execute()
        if getattr(pay_res, "error", None):
            raise_for_error(pay_res, "sum payments against open invoices")
        paid_against_open = _sum_amount(pay_res.data or [])
    outstanding = total_billed - paid_against_open

    return PaymentSummaryOut(
        total_collected=total_collected,
        this_month=this_month,
        total_payments=total_payments,
        outstanding=outstanding,
    )


def list_payments(
    db: Client,
    user: dict,
    *,
    page: int,
    per_page: int,
    resident_id: str | None,
    invoice_id: str | None,
    payment_method: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    search: str | None = None,
) -> PaymentList:
    if has_permission(db, user, "payments.view"):
        scope = str(resident_id) if resident_id else None
    elif has_permission(db, user, "payments.view_own"):
        own = get_resident_by_user(db, user["id"])
        if own is None:
            raise ForbiddenError("No resident profile linked to this account", code="resident_not_linked")
        scope = str(own["id"])
    else:
        raise ForbiddenError("You cannot view payments", code="missing_permission")

    eq = {"resident_id": scope} if scope else {}
    if invoice_id:
        eq["invoice_id"] = invoice_id
    if payment_method:
        eq["payment_method"] = payment_method

    search_groups: list[str] = []
    if search and search.strip():
        needle = search.strip()
        resident_ids = _resolve_resident_search(db, needle)
        if resident_ids:
            search_groups.append(f"resident_id.in.({','.join(resident_ids)})")
        invoice_ids = _resolve_invoice_number_search(db, needle)
        if invoice_ids:
            search_groups.append(f"invoice_id.in.({','.join(invoice_ids)})")

    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        select=_SELECT, eq=eq or None,
        search=search, search_columns=("payment_reference",), search_groups=search_groups,
        gte={"payment_date": date_from} if date_from else None,
        lte={"payment_date": date_to} if date_to else None,
        order="payment_date", desc=True,
    )
    return PaymentList(
        items=[PaymentOut.model_validate(i) for i in items],
        total=total, page=page, per_page=per_page,
        summary=_compute_summary(db),
    )
