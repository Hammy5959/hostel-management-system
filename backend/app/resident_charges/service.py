"""Resident charge business logic."""

from __future__ import annotations

from decimal import Decimal

from supabase import Client

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.database.crud import get_by_id, insert, list_page
from app.database.crud import update as crud_update
from app.database.supabase import raise_for_error
from app.fee_structures import service as fee_structures_service
from app.residents.service import has_active_allocation
from app.resident_charges.schemas import (
    ResidentChargeCreate,
    ResidentChargeList,
    ResidentChargeOut,
    ResidentChargeSummaryOut,
    ResidentChargeUpdate,
)

_TABLE = "resident_charges"
# Aliased so the embed keys match the schema's singular field names
# (`resident`/`fee_structure`) — mirrors app.allocations.service._SELECT.
_SELECT = (
    "*, "
    "resident:residents(id, first_name, last_name, student_id, profile_picture_url), "
    "fee_structure:fee_structures(id, name, amount, frequency), "
    "invoice:invoices(id, invoice_number)"
)


def _fetch_current_room_by_resident(db: Client, resident_ids: list[str]) -> dict[str, str]:
    """Current room number per resident, resolved from each resident's active
    `room_allocations` row — the reverse of
    app.rooms.service._fetch_current_residents (room -> residents)."""
    if not resident_ids:
        return {}
    res = (
        db.table("room_allocations")
        .select("resident_id, rooms(room_number)")
        .eq("status", "active")
        .in_("resident_id", resident_ids)
        .execute()
    )
    if getattr(res, "error", None):
        raise_for_error(res, "list resident rooms")
    by_resident: dict[str, str] = {}
    for row in res.data or []:
        room = row.get("rooms")
        if room and row["resident_id"] not in by_resident:
            by_resident[row["resident_id"]] = room["room_number"]
    return by_resident


def _with_extras(row: dict, room_by_resident: dict[str, str]) -> dict:
    amount = Decimal(str(row["amount"]))
    amount_paid = Decimal(str(row.get("amount_paid") or 0))
    return {
        **row,
        "balance": amount - amount_paid,
        "room_number": room_by_resident.get(row["resident_id"]),
    }


def _count_charges(db: Client, status: str | None = None) -> int:
    query = db.table(_TABLE).select("id", count="exact")
    if status is not None:
        query = query.eq("status", status)
    res = query.execute()
    if getattr(res, "error", None):
        raise_for_error(res, "count resident charges")
    return int(res.count or 0)


def _resolve_resident_search(db: Client, search: str) -> list[str]:
    """Resolve a resident-name search term to matching resident ids — same
    full-name matching rule as app.allocations.service._resolve_search_scope
    (first_name/last_name/full-name, case-insensitive partial match)."""
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


def create(db: Client, user: dict, data: ResidentChargeCreate) -> ResidentChargeOut:
    if get_by_id(db, "residents", str(data.resident_id)) is None:
        raise NotFoundError("Resident not found", code="resident_not_found")
    if not has_active_allocation(db, str(data.resident_id)):
        raise ConflictError(
            "Cannot charge a resident without an active room allocation",
            code="resident_not_allocated",
        )
    if data.fee_structure_id:
        fee_structures_service.ensure_usable(db, str(data.fee_structure_id))
    payload = data.model_dump(mode="json")
    payload["status"] = "pending"
    payload["created_by"] = user["id"]
    created = insert(db, _TABLE, payload)
    return get(db, created["id"])


def get(db: Client, charge_id: str) -> ResidentChargeOut:
    res = db.table(_TABLE).select(_SELECT).eq("id", charge_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "get resident charge")
    if not res.data:
        raise NotFoundError("Resident charge not found", code="resident_charge_not_found")
    row = res.data[0]
    room_by_resident = _fetch_current_room_by_resident(db, [row["resident_id"]])
    return ResidentChargeOut.model_validate(_with_extras(row, room_by_resident))


def list_charges(
    db: Client,
    *,
    page: int,
    per_page: int,
    resident_id: str | None,
    status: str | None,
    search: str | None,
) -> ResidentChargeList:
    eq: dict = {}
    if resident_id:
        eq["resident_id"] = resident_id
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
        search=search, search_columns=("charge_type",), search_groups=search_groups,
        order="charge_date", desc=True,
    )

    resident_ids_on_page = [i["resident_id"] for i in items]
    room_by_resident = _fetch_current_room_by_resident(db, resident_ids_on_page)

    summary = ResidentChargeSummaryOut(
        total=_count_charges(db),
        pending=_count_charges(db, "pending"),
        invoiced=_count_charges(db, "invoiced"),
        paid=_count_charges(db, "paid"),
    )

    return ResidentChargeList(
        items=[ResidentChargeOut.model_validate(_with_extras(i, room_by_resident)) for i in items],
        total=total, page=page, per_page=per_page, summary=summary,
    )


def update(db: Client, charge_id: str, data: ResidentChargeUpdate) -> ResidentChargeOut:
    row = get_by_id(db, _TABLE, charge_id)
    if row is None:
        raise NotFoundError("Resident charge not found", code="resident_charge_not_found")
    payload = data.model_dump(mode="json", exclude_unset=True)
    # Safety net mirroring the edit UI's rules: waived/cancelled is a manual
    # override only available while a charge is still pending. Once it's
    # invoiced its status is owned by the invoice (hms_record_payment flips it
    # to paid; app.invoices.service.cancel_invoice reverts it to pending), and
    # paid/waived/cancelled are already terminal — none of those should be
    # overridable via this endpoint regardless of what the client sends.
    if payload.get("status") in ("waived", "cancelled") and row["status"] != "pending":
        raise ConflictError(
            "Only a pending charge can be manually waived or cancelled", code="charge_not_pending"
        )
    if "amount_paid" in payload and payload["amount_paid"] is not None:
        if Decimal(str(payload["amount_paid"])) > Decimal(str(row["amount"])):
            raise BadRequestError(
                "Amount paid cannot exceed the charge amount", code="amount_paid_exceeds_charge"
            )
    crud_update(db, _TABLE, charge_id, payload)
    return get(db, charge_id)
