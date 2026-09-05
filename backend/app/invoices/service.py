"""Invoice business logic.

Money is Decimal end-to-end. Invoice totals are computed server-side from line
items (subtotal = sum(qty * unit_amount); total = subtotal - discount), so the
client can never dictate the total.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from supabase import Client

from app.common.authz import has_permission
from app.common.numbers import generate_number
from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.database.crud import get_by_id, list_page
from app.database.supabase import raise_for_error
from app.fee_structures import service as fee_structures_service
from app.invoices.schemas import InvoiceCreate, InvoiceList, InvoiceOut, InvoiceSummaryOut, InvoiceUpdate
from app.notifications.service import notify_resident
from app.residents.service import get_resident_by_user, has_active_allocation

_TABLE = "invoices"
_ITEMS_TABLE = "invoice_items"
# Aliased so the embed key matches the schema's singular `resident` field —
# mirrors app.allocations.service._SELECT / app.resident_charges.service._SELECT.
_SELECT = "*, items:invoice_items(*), resident:residents(id, first_name, last_name, student_id, profile_picture_url)"


def get_earliest_outstanding_invoice_by_resident(db: Client, resident_ids: list[str]) -> dict[str, dict]:
    """Earliest-due, still-outstanding invoice per resident. `invoices.status
    = 'overdue'` is never set by any code path in this codebase (no scheduled
    job), so `overdue` here means "the due date has already passed" — callers
    compute that fresh against today rather than reading a stale status
    column. Shared by app.allocations.service (payment_status pill) and
    app.rooms.service (rent_status), which each format this raw row
    differently — this is only the query, not the presentation."""
    if not resident_ids:
        return {}
    res = (
        db.table("invoices")
        .select("resident_id, due_date, status")
        .in_("resident_id", resident_ids)
        .in_("status", ["issued", "partially_paid", "overdue"])
        .order("due_date", desc=False)
        .execute()
    )
    if getattr(res, "error", None):
        raise_for_error(res, "list resident invoices")
    earliest: dict[str, dict] = {}
    for row in res.data or []:
        earliest.setdefault(row["resident_id"], row)
    return earliest


def get_residents_with_any_invoice(db: Client, resident_ids: list[str]) -> set[str]:
    """Which of `resident_ids` have EVER had an invoice, in any status —
    including old invoices from a prior stay/allocation cycle, since this
    queries by resident_id alone with no status or allocation scoping. Lets
    callers distinguish "genuinely paid" (had invoices, none outstanding
    now) from "no_dues" (never billed at all), which
    get_earliest_outstanding_invoice_by_resident's `None` result can't tell
    apart on its own — that helper only ever looks at outstanding invoices,
    so a fully-settled resident and a never-billed one both come back
    `None` from it."""
    if not resident_ids:
        return set()
    res = (
        db.table("invoices")
        .select("resident_id")
        .in_("resident_id", resident_ids)
        .execute()
    )
    if getattr(res, "error", None):
        raise_for_error(res, "check resident billing history")
    return {row["resident_id"] for row in res.data or []}


def _fetch_amount_paid_by_invoice(db: Client, invoice_ids: list[str]) -> dict[str, Decimal]:
    """Sum of completed payments per invoice — the only source of truth for
    how much of an invoice has been paid. There is no stored amount_paid
    column; this is always empty today since nothing writes to `payments`
    yet (that's a later task), which is the correct state to show."""
    if not invoice_ids:
        return {}
    res = (
        db.table("payments")
        .select("invoice_id, amount")
        .in_("invoice_id", invoice_ids)
        .eq("status", "completed")
        .execute()
    )
    if getattr(res, "error", None):
        raise_for_error(res, "list invoice payments")
    totals: dict[str, Decimal] = {}
    for row in res.data or []:
        invoice_id = row.get("invoice_id")
        if invoice_id:
            totals[invoice_id] = totals.get(invoice_id, Decimal("0")) + Decimal(str(row["amount"]))
    return totals


def _with_extras(row: dict, paid_by_invoice: dict[str, Decimal]) -> dict:
    total = Decimal(str(row["total_amount"]))
    paid = paid_by_invoice.get(row["id"], Decimal("0"))
    return {**row, "amount_paid": paid, "balance": total - paid}


def _count_invoices(db: Client, *, status: str | None = None, status_in: list[str] | None = None) -> int:
    query = db.table(_TABLE).select("id", count="exact")
    if status is not None:
        query = query.eq("status", status)
    if status_in is not None:
        query = query.in_("status", status_in)
    res = query.execute()
    if getattr(res, "error", None):
        raise_for_error(res, "count invoices")
    return int(res.count or 0)


def _resolve_resident_search(db: Client, search: str) -> list[str]:
    """Resolve a resident-name search term to matching resident ids — same
    full-name matching rule as app.allocations.service._resolve_search_scope /
    app.resident_charges.service._resolve_resident_search."""
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


def _fetch(db: Client, invoice_id: str) -> dict:
    res = db.table(_TABLE).select(_SELECT).eq("id", invoice_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "get invoice")
    if not res.data:
        raise NotFoundError("Invoice not found", code="invoice_not_found")
    row = res.data[0]
    paid_by_invoice = _fetch_amount_paid_by_invoice(db, [row["id"]])
    return _with_extras(row, paid_by_invoice)


def _fetch_pending_charges(db: Client, resident_id: str, charge_ids: list[str]) -> list[dict]:
    """Load and validate the resident_charges rows selected in Create Invoice.

    Description/amount for the resulting line items always come from these
    rows, never from the client, so a tampered request can't invoice the
    wrong amount. Rejects charges that don't belong to this resident or are
    no longer pending (e.g. already invoiced by a concurrent request)."""
    res = db.table("resident_charges").select("*").in_("id", charge_ids).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "list resident charges")
    rows = res.data or []
    found_ids = {row["id"] for row in rows}
    missing = set(charge_ids) - found_ids
    if missing:
        raise NotFoundError("One or more resident charges were not found", code="resident_charge_not_found")
    for row in rows:
        if row["resident_id"] != resident_id:
            raise BadRequestError(
                "A selected charge does not belong to the selected resident", code="charge_resident_mismatch"
            )
        if row["status"] != "pending":
            raise ConflictError(
                "A selected charge is no longer pending", code="charge_not_pending"
            )
    return rows


def create_invoice(db: Client, user: dict, data: InvoiceCreate) -> InvoiceOut:
    if get_by_id(db, "residents", str(data.resident_id)) is None:
        raise NotFoundError("Resident not found", code="resident_not_found")
    if not has_active_allocation(db, str(data.resident_id)):
        raise ConflictError(
            "Cannot invoice a resident without an active room allocation",
            code="resident_not_allocated",
        )

    if not data.items and not data.resident_charge_ids:
        raise BadRequestError(
            "An invoice needs at least one line item or selected charge", code="invoice_empty"
        )

    for item in data.items:
        if item.fee_structure_id:
            fee_structures_service.ensure_usable(db, str(item.fee_structure_id))

    charges = _fetch_pending_charges(db, str(data.resident_id), [str(cid) for cid in data.resident_charge_ids])

    manual_item_rows = [
        {
            "invoice_id": None,
            "fee_structure_id": str(item.fee_structure_id) if item.fee_structure_id else None,
            "description": item.description,
            "quantity": str(item.quantity),
            "unit_amount": str(item.unit_amount),
            "total_amount": str(item.quantity * item.unit_amount),
        }
        for item in data.items
    ]
    charge_item_rows = [
        {
            "invoice_id": None,
            "fee_structure_id": charge.get("fee_structure_id"),
            "description": f"{charge['charge_type']} — {charge['description']}"
            if charge.get("description")
            else charge["charge_type"],
            "quantity": "1",
            "unit_amount": str(charge["amount"]),
            "total_amount": str(charge["amount"]),
        }
        for charge in charges
    ]

    subtotal = sum((Decimal(row["total_amount"]) for row in manual_item_rows + charge_item_rows), Decimal("0"))
    total = subtotal - data.discount
    if total < 0:
        raise BadRequestError("Discount cannot exceed the subtotal", code="discount_exceeds_subtotal")

    invoice = {
        "resident_id": str(data.resident_id),
        "invoice_number": generate_number("INV"),
        "issue_date": data.issue_date.isoformat(),
        "due_date": data.due_date.isoformat() if data.due_date else None,
        "subtotal": str(subtotal),
        "discount": str(data.discount),
        "total_amount": str(total),
        "status": "draft",
        "notes": data.notes,
        "created_by": user["id"],
    }
    res = db.table(_TABLE).insert(invoice).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "create invoice")
    created = res.data[0]

    item_rows = [{**row, "invoice_id": created["id"]} for row in manual_item_rows + charge_item_rows]
    res_items = db.table(_ITEMS_TABLE).insert(item_rows).execute()
    if getattr(res_items, "error", None):
        raise_for_error(res_items, "create invoice items")

    if charges:
        res_charges = (
            db.table("resident_charges")
            .update({"status": "invoiced", "invoice_id": created["id"]})
            .in_("id", [charge["id"] for charge in charges])
            .execute()
        )
        if getattr(res_charges, "error", None):
            raise_for_error(res_charges, "link resident charges to invoice")

    return InvoiceOut.model_validate(_fetch(db, created["id"]))


def get_invoice(db: Client, invoice_id: str) -> InvoiceOut:
    return InvoiceOut.model_validate(_fetch(db, invoice_id))


def list_invoices(
    db: Client,
    user: dict,
    *,
    page: int,
    per_page: int,
    resident_id: str | None,
    status: str | None,
    date_from: str | None,
    date_to: str | None,
    search: str | None,
) -> InvoiceList:
    if has_permission(db, user, "invoices.view"):
        scope = str(resident_id) if resident_id else None
    elif has_permission(db, user, "invoices.view_own"):
        own = get_resident_by_user(db, user["id"])
        if own is None:
            raise ForbiddenError("No resident profile linked to this account", code="resident_not_linked")
        scope = str(own["id"])
    else:
        raise ForbiddenError("You cannot view invoices", code="missing_permission")

    eq = {"resident_id": scope} if scope else {}
    if status:
        eq["status"] = status

    search_groups: list[str] = []
    if search and search.strip():
        resident_ids = _resolve_resident_search(db, search.strip())
        if resident_ids:
            search_groups.append(f"resident_id.in.({','.join(resident_ids)})")

    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        select=_SELECT, eq=eq or None,
        search=search, search_columns=("invoice_number",), search_groups=search_groups,
        gte={"issue_date": date_from} if date_from else None,
        lte={"issue_date": date_to} if date_to else None,
        order="issue_date", desc=True,
    )

    invoice_ids = [i["id"] for i in items]
    paid_by_invoice = _fetch_amount_paid_by_invoice(db, invoice_ids)

    summary = InvoiceSummaryOut(
        total=_count_invoices(db),
        draft=_count_invoices(db, status="draft"),
        issued_unpaid=_count_invoices(db, status_in=["issued", "partially_paid", "overdue"]),
        paid=_count_invoices(db, status="paid"),
    )

    return InvoiceList(
        items=[InvoiceOut.model_validate(_with_extras(i, paid_by_invoice)) for i in items],
        total=total, page=page, per_page=per_page, summary=summary,
    )


def update_invoice(db: Client, invoice_id: str, data: InvoiceUpdate) -> InvoiceOut:
    invoice = _fetch(db, invoice_id)
    if invoice["status"] not in ("draft",):
        raise ConflictError("Only draft invoices can be edited", code="invoice_locked")
    payload = data.model_dump(mode="json", exclude_unset=True)
    if payload.get("discount") is not None:
        new_discount = Decimal(payload["discount"])
        if new_discount > Decimal(invoice["subtotal"]):
            raise BadRequestError("Discount cannot exceed the subtotal", code="discount_exceeds_subtotal")
        payload["total_amount"] = str(Decimal(invoice["subtotal"]) - new_discount)
    res = db.table(_TABLE).update(payload).eq("id", invoice_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "update invoice")
    return InvoiceOut.model_validate(_fetch(db, invoice_id))


def issue_invoice(db: Client, invoice_id: str) -> InvoiceOut:
    invoice = _fetch(db, invoice_id)
    if invoice["status"] != "draft":
        raise ConflictError("Only draft invoices can be issued", code="invalid_transition")
    res = db.table(_TABLE).update(
        {"status": "issued", "updated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", invoice_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "issue invoice")
    issued = InvoiceOut.model_validate(_fetch(db, invoice_id))
    due = f" due {issued.due_date}" if issued.due_date else ""
    notify_resident(
        db,
        str(issued.resident_id),
        title="Invoice issued",
        message=f"Invoice {issued.invoice_number} for {issued.total_amount} is ready{due}.",
        reference_type="invoice",
        reference_id=str(issued.id),
    )
    return issued


def cancel_invoice(db: Client, invoice_id: str) -> InvoiceOut:
    invoice = _fetch(db, invoice_id)
    if invoice["status"] in ("paid", "cancelled"):
        raise ConflictError(f"Cannot cancel an invoice in '{invoice['status']}' state", code="invalid_transition")
    if invoice["amount_paid"] > 0:
        # Checked against actual completed payments, not the status label —
        # a partially_paid invoice always has amount_paid > 0, but this also
        # guards against any future case where status could lag reality.
        # Cancelling an invoice with real money against it would orphan
        # those payment rows and let the underlying charges be re-billed;
        # a proper void-with-reversal flow is a separate, later feature.
        raise ConflictError(
            "Cannot cancel an invoice with completed payments against it", code="invoice_has_payments"
        )
    res = db.table(_TABLE).update({"status": "cancelled"}).eq("id", invoice_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "cancel invoice")
    # Free up any charges still sitting at 'invoiced' on this now-cancelled
    # invoice so they can be folded into a future invoice — reverse of the
    # pending -> invoiced flip create_invoice does above. A charge an admin
    # already moved to 'waived'/'cancelled' never matches this filter, so it's
    # left alone; a 'paid' charge can't exist here since an invoice reaching
    # 'paid' can't be cancelled (checked above).
    res_charges = (
        db.table("resident_charges")
        .update({"status": "pending", "invoice_id": None})
        .eq("invoice_id", invoice_id)
        .eq("status", "invoiced")
        .execute()
    )
    if getattr(res_charges, "error", None):
        raise_for_error(res_charges, "revert resident charges on cancelled invoice")
    return InvoiceOut.model_validate(_fetch(db, invoice_id))
