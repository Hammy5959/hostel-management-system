"""Fee structure business logic."""

from __future__ import annotations

from datetime import date

from supabase import Client

from app.core.exceptions import BadRequestError, NotFoundError
from app.database.crud import get_by_id, insert, list_page
from app.database.crud import update as crud_update
from app.database.supabase import raise_for_error
from app.fee_structures.schemas import (
    FeeStructureCreate,
    FeeStructureList,
    FeeStructureOut,
    FeeStructureSummaryOut,
    FeeStructureUpdate,
)

_TABLE = "fee_structures"


def _as_date(value: date | str | None) -> date | None:
    if value is None or isinstance(value, date):
        return value
    return date.fromisoformat(value)


def compute_availability(row: dict, today: date | None = None) -> tuple[str, bool]:
    """The single reusable "is this fee structure usable right now" check —
    used both to render the Fee Structures page (date_status/is_currently_usable
    on every row) and to gate billing usage (see `ensure_usable` below). A fee
    structure is usable only when it's active AND today falls inside its
    effective window (an unset bound means "no limit on that side")."""
    today = today or date.today()
    effective_from = _as_date(row.get("effective_from"))
    effective_until = _as_date(row.get("effective_until"))

    if effective_from and effective_from > today:
        date_status = "not_yet_active"
    elif effective_until and effective_until < today:
        date_status = "expired"
    elif effective_from is None and effective_until is None:
        date_status = "continuous"
    else:
        date_status = "current"

    is_usable = bool(row.get("is_active")) and date_status in ("current", "continuous")
    return date_status, is_usable


def _with_availability(row: dict) -> dict:
    date_status, is_usable = compute_availability(row)
    return {**row, "date_status": date_status, "is_currently_usable": is_usable}


def ensure_usable(db: Client, fee_structure_id: str) -> dict:
    """Raise a clear, user-facing error if this fee structure cannot be used
    right now. Called by anything that bills against a fee structure
    (invoices, resident charges) so an expired, not-yet-started, or inactive
    one can never be silently used — the reusable validation gate."""
    row = get_by_id(db, _TABLE, fee_structure_id)
    if row is None:
        raise NotFoundError("Fee structure not found", code="fee_structure_not_found")

    date_status, is_usable = compute_availability(row)
    if is_usable:
        return row
    if not row.get("is_active"):
        raise BadRequestError("This fee structure is inactive and cannot be used.", code="fee_structure_inactive")
    if date_status == "not_yet_active":
        raise BadRequestError(
            f"This fee structure is not yet active (effective from {row['effective_from']}).",
            code="fee_structure_not_yet_active",
        )
    raise BadRequestError(
        f"This fee structure expired on {row['effective_until']} and can no longer be used.",
        code="fee_structure_expired",
    )


def _count_fee_structures(db: Client, is_active: bool | None = None) -> int:
    query = db.table(_TABLE).select("id", count="exact")
    if is_active is not None:
        query = query.eq("is_active", is_active)
    res = query.execute()
    if getattr(res, "error", None):
        raise_for_error(res, "count fee structures")
    return int(res.count or 0)


def create(db: Client, user: dict, data: FeeStructureCreate) -> FeeStructureOut:
    payload = data.model_dump(mode="json")
    payload["created_by"] = user["id"]
    return FeeStructureOut.model_validate(_with_availability(insert(db, _TABLE, payload)))


def get(db: Client, fee_structure_id: str) -> FeeStructureOut:
    row = get_by_id(db, _TABLE, fee_structure_id)
    if row is None:
        raise NotFoundError("Fee structure not found", code="fee_structure_not_found")
    return FeeStructureOut.model_validate(_with_availability(row))


def list_fee_structures(
    db: Client, *, page: int, per_page: int, search: str | None, is_active: bool | None = None
) -> FeeStructureList:
    eq = {"is_active": is_active} if is_active is not None else None
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        eq=eq, search=search, search_columns=("name",),
        order="name", desc=False,
    )
    summary = FeeStructureSummaryOut(
        total=_count_fee_structures(db),
        active=_count_fee_structures(db, True),
        inactive=_count_fee_structures(db, False),
    )
    return FeeStructureList(
        items=[FeeStructureOut.model_validate(_with_availability(i)) for i in items],
        total=total, page=page, per_page=per_page, summary=summary,
    )


def update(db: Client, fee_structure_id: str, data: FeeStructureUpdate) -> FeeStructureOut:
    if get_by_id(db, _TABLE, fee_structure_id) is None:
        raise NotFoundError("Fee structure not found", code="fee_structure_not_found")
    updated = crud_update(db, _TABLE, fee_structure_id, data.model_dump(mode="json", exclude_unset=True))
    return FeeStructureOut.model_validate(_with_availability(updated))
