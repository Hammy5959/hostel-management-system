"""Asset assignment business logic.

Assigning marks the asset 'assigned'; returning closes the assignment and
returns the asset to 'available'. History is preserved (never deleted).
"""

from __future__ import annotations

from datetime import datetime, timezone

from supabase import Client

from app.asset_assignments.schemas import AssignmentCreate, AssignmentList, AssignmentOut, AssignmentReturn
from app.core.exceptions import ConflictError, NotFoundError
from app.database.crud import get_by_id, insert
from app.database.supabase import raise_for_error

_TABLE = "asset_assignments"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_assignment(db: Client, user: dict, data: AssignmentCreate) -> AssignmentOut:
    asset = get_by_id(db, "assets", str(data.asset_id))
    if asset is None:
        raise NotFoundError("Asset not found", code="asset_not_found")
    if asset["status"] != "available":
        raise ConflictError("Asset is not available for assignment", code="asset_not_available")
    if data.resident_id and get_by_id(db, "residents", str(data.resident_id)) is None:
        raise NotFoundError("Resident not found", code="resident_not_found")
    if data.staff_id and get_by_id(db, "staff", str(data.staff_id)) is None:
        raise NotFoundError("Staff record not found", code="staff_not_found")
    if data.room_id and get_by_id(db, "rooms", str(data.room_id)) is None:
        raise NotFoundError("Room not found", code="room_not_found")

    payload = data.model_dump(mode="json")
    payload["assigned_by"] = user["id"]
    assignment = insert(db, _TABLE, payload)
    db.table("assets").update({"status": "assigned", "updated_at": _now_iso()}).eq("id", str(data.asset_id)).execute()
    return AssignmentOut.model_validate(assignment)


def list_assignments(
    db: Client, *, page: int, per_page: int, asset_id: str | None, returned: bool | None
) -> AssignmentList:
    eq: dict = {}
    if asset_id:
        eq["asset_id"] = asset_id
    if returned is True:
        query = db.table(_TABLE).select("*", count="exact").not_.is_("returned_at", "null")
    elif returned is False:
        query = db.table(_TABLE).select("*", count="exact").is_("returned_at", "null")
    else:
        query = db.table(_TABLE).select("*", count="exact")
    for col, val in eq.items():
        query = query.eq(col, val)
    query = query.order("assigned_at", desc=True).range((page - 1) * per_page, page * per_page - 1)
    res = query.execute()
    if getattr(res, "error", None):
        raise_for_error(res, "list asset assignments")
    return AssignmentList(items=[AssignmentOut.model_validate(i) for i in res.data], total=int(res.count or 0), page=page, per_page=per_page)


def return_assignment(db: Client, assignment_id: str, data: AssignmentReturn) -> AssignmentOut:
    assignment = get_by_id(db, _TABLE, assignment_id)
    if assignment is None:
        raise NotFoundError("Asset assignment not found", code="assignment_not_found")
    if assignment["returned_at"] is not None:
        raise ConflictError("Assignment has already been returned", code="already_returned")

    res = db.table(_TABLE).update({
        "returned_at": _now_iso(),
        "condition_on_return": data.condition_on_return,
        "notes": data.notes,
    }).eq("id", assignment_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "return asset assignment")

    db.table("assets").update({"status": "available", "updated_at": _now_iso()}).eq("id", assignment["asset_id"]).execute()
    return AssignmentOut.model_validate(res.data[0])
