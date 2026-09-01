"""Resident stay business logic (check-in / check-out).

Stay lifecycle: scheduled -> checked_in -> checked_out. Both transitions and
their side effects (allocation + bed + resident status) run inside transactional
database functions to keep them atomic.
"""

from __future__ import annotations

from supabase import Client

from app.audit.service import record_audit
from app.common.authz import has_permission
from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.database.crud import get_by_id, insert, list_page
from app.database.rpc import rpc_call
from app.residents.service import get_resident_by_user
from app.stays.schemas import StayCheckIn, StayCheckOut, StayCreate, StayList, StayOut

_TABLE = "resident_stays"

_STAY_ERR_MAP = {
    "stay_not_found": (404, "stay_not_found", "Stay not found"),
    "stay_not_scheduled": (409, "invalid_transition", "The stay is not in a scheduled state"),
    "stay_not_checked_in": (409, "invalid_transition", "The stay is not checked in"),
    "stay_already_checked_in": (409, "duplicate_active_stay", "The resident already has an active stay"),
    "allocation_not_found": (404, "allocation_not_found", "Allocation not found"),
    "allocation_not_active": (409, "allocation_not_active", "The allocation is not active"),
    "bed_not_occupied": (409, "bed_not_occupied", "The bed is not occupied"),
}


def create_stay(db: Client, data: StayCreate) -> StayOut:
    allocation = get_by_id(db, "room_allocations", str(data.allocation_id))
    if allocation is None:
        raise NotFoundError("Allocation not found", code="allocation_not_found")
    if allocation["status"] != "active":
        raise BadRequestError("Allocation is not active", code="allocation_not_active")
    if str(allocation["resident_id"]) != str(data.resident_id):
        raise BadRequestError("Allocation does not belong to this resident", code="allocation_mismatch")
    if get_by_id(db, "residents", str(data.resident_id)) is None:
        raise NotFoundError("Resident not found", code="resident_not_found")

    payload = data.model_dump(mode="json")
    payload["status"] = "scheduled"
    payload.pop("notes", None)
    if payload.get("expected_check_out_at") is None and allocation.get("allocated_until"):
        payload["expected_check_out_at"] = f"{allocation['allocated_until']}T23:59:59Z"
    return StayOut.model_validate(insert(db, _TABLE, payload))


def check_in(db: Client, user: dict, stay_id: str, data: StayCheckIn) -> StayOut:
    rows = rpc_call(db, "hms_check_in", {
        "p_stay_id": stay_id,
        "p_check_in_by": user["id"],
        "p_notes": data.notes,
    }, _STAY_ERR_MAP)
    stay = StayOut.model_validate(rows[0])
    record_audit(
        db,
        user_id=user["id"],
        action="stay.check_in",
        module="resident_stays",
        entity_type="resident_stay",
        entity_id=stay_id,
        description=f"Checked in resident {stay.resident_id}",
    )
    return stay


def check_out(db: Client, user: dict, stay_id: str, data: StayCheckOut) -> StayOut:
    rows = rpc_call(db, "hms_check_out", {
        "p_stay_id": stay_id,
        "p_check_out_by": user["id"],
        "p_notes": data.notes,
    }, _STAY_ERR_MAP)
    stay = StayOut.model_validate(rows[0])
    record_audit(
        db,
        user_id=user["id"],
        action="stay.check_out",
        module="resident_stays",
        entity_type="resident_stay",
        entity_id=stay_id,
        description=f"Checked out resident {stay.resident_id}",
    )
    return stay


def list_stays(
    db: Client,
    user: dict,
    *,
    page: int,
    per_page: int,
    resident_id: str | None,
    status: str | None,
) -> StayList:
    if has_permission(db, user, "stays.view"):
        scope = str(resident_id) if resident_id else None
    elif has_permission(db, user, "stays.view_own"):
        own = get_resident_by_user(db, user["id"])
        if own is None:
            raise ForbiddenError("No resident profile linked to this account", code="resident_not_linked")
        scope = str(own["id"])
    else:
        raise ForbiddenError("You cannot view stays", code="missing_permission")

    eq: dict = {}
    if scope:
        eq["resident_id"] = scope
    if status:
        eq["status"] = status
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        eq=eq or None, order="created_at", desc=True,
    )
    return StayList(items=[StayOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)
