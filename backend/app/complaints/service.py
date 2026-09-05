"""Complaint business logic.

Workflow: open -> assigned -> in_progress -> resolved -> closed, or cancelled
from open/assigned/in_progress. A resident creates and views only their own
complaints; staff manage the status.
"""

from __future__ import annotations

from supabase import Client

from app.common.authz import has_permission
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.notifications.service import notify_resident
from app.residents.service import get_resident_by_user
from app.complaints.schemas import ComplaintCreate, ComplaintList, ComplaintOut, ComplaintUpdate

_TABLE = "complaints"

_ALLOWED_TRANSITIONS = {
    "open": {"assigned", "in_progress", "cancelled"},
    "assigned": {"in_progress", "cancelled"},
    "in_progress": {"resolved", "cancelled"},
    "resolved": {"closed"},
    "closed": set(),
    "cancelled": set(),
}


def _fetch(db: Client, complaint_id: str) -> dict:
    row = get_by_id(db, _TABLE, complaint_id)
    if row is None:
        raise NotFoundError("Complaint not found", code="complaint_not_found")
    return row


def create(db: Client, user: dict, data: ComplaintCreate) -> ComplaintOut:
    if get_by_id(db, "residents", str(data.resident_id)) is None:
        raise NotFoundError("Resident not found", code="resident_not_found")
    if data.room_id and get_by_id(db, "rooms", str(data.room_id)) is None:
        raise NotFoundError("Room not found", code="room_not_found")
    if not has_permission(db, user, "complaints.view"):
        own = get_resident_by_user(db, user["id"])
        if own is None or str(own["id"]) != str(data.resident_id):
            raise ForbiddenError("You can only file complaints for yourself", code="not_your_resident")
    payload = data.model_dump(mode="json")
    payload["status"] = "open"
    return ComplaintOut.model_validate(insert(db, _TABLE, payload))


def list_complaints(
    db: Client,
    user: dict,
    *,
    page: int,
    per_page: int,
    resident_id: str | None,
    status: str | None,
    room_id: str | None,
) -> ComplaintList:
    if has_permission(db, user, "complaints.view"):
        scope = str(resident_id) if resident_id else None
    elif has_permission(db, user, "complaints.view_own"):
        own = get_resident_by_user(db, user["id"])
        if own is None:
            raise ForbiddenError("No resident profile linked to this account", code="resident_not_linked")
        scope = str(own["id"])
    else:
        raise ForbiddenError("You cannot view complaints", code="missing_permission")

    eq: dict = {}
    if scope:
        eq["resident_id"] = scope
    if status:
        eq["status"] = status
    if room_id:
        eq["room_id"] = room_id
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page, eq=eq or None,
        search_columns=("title", "description"), search=None,
        order="created_at", desc=True,
    )
    return ComplaintList(items=[ComplaintOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def update_complaint(db: Client, complaint_id: str, data: ComplaintUpdate) -> ComplaintOut:
    complaint = _fetch(db, complaint_id)
    payload = data.model_dump(exclude_unset=True)
    new_status = payload.get("status")
    status_changed = bool(new_status) and new_status != complaint["status"]
    if status_changed:
        if new_status not in _ALLOWED_TRANSITIONS.get(complaint["status"], set()):
            raise ConflictError(
                f"Cannot move a complaint from '{complaint['status']}' to '{new_status}'", code="invalid_transition"
            )
    updated = ComplaintOut.model_validate(update(db, _TABLE, complaint_id, payload))
    if status_changed:
        notify_resident(
            db,
            str(updated.resident_id),
            title="Complaint updated",
            message=f"Your complaint '{updated.title}' is now {updated.status}.",
            reference_type="complaint",
            reference_id=str(updated.id),
        )
    return updated
