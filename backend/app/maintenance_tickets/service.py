"""Maintenance ticket business logic.

Workflow mirrors complaints: open -> assigned -> in_progress -> resolved ->
closed (or cancelled). Assignment records the staff member and timestamp.
"""

from __future__ import annotations

from datetime import datetime, timezone

from supabase import Client

from app.common.authz import has_permission
from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.maintenance_tickets.schemas import (
    TicketCreate,
    TicketList,
    TicketOut,
    TicketUpdate,
)
from app.notifications.service import notify_resident, notify_staff
from app.staff.crud import get_staff_by_user

# room_id is nullable on maintenance_tickets, so the `room` embed must NOT be
# forced `!inner` (that would silently drop tickets with no room at all from
# the result set). Once a room does match, `floors!inner` is safe — rooms
# have a non-nullable floor_id FK (see app.rooms.service._SELECT's comment) —
# mirrors the exact embed/flatten shape already proven in
# app.allocations.service._SELECT / _flatten_room_location and
# app.rooms.service._SELECT / _with_room_details: rooms has no flat
# floor_name/building_name columns, those live on the separate floors/
# buildings tables and PostgREST returns them nested, not flattened.
_ROOM_SELECT = "*, room:rooms(id, room_number, floors!inner(name, buildings(name)))"

_TABLE = "maintenance_tickets"

_ALLOWED_TRANSITIONS = {
    "open": {"assigned", "in_progress", "cancelled"},
    "assigned": {"in_progress", "cancelled"},
    "in_progress": {"resolved", "cancelled"},
    "resolved": {"closed"},
    "closed": set(),
    "cancelled": set(),
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _flatten_ticket_room(item: dict) -> None:
    """Move the room's embedded `floors`/`buildings` names up onto the room
    dict as `floor_name`/`building_name` — same flattening as
    app.allocations.service._flatten_room_location, no-op when the ticket has
    no room (embed comes back as `None`, not an empty dict)."""
    room = item.get("room")
    if not room:
        return
    floors = room.pop("floors", None) or {}
    buildings = floors.get("buildings") or {}
    room["floor_name"] = floors.get("name")
    room["building_name"] = buildings.get("name")


def _fetch(db: Client, ticket_id: str) -> dict:
    row = get_by_id(db, _TABLE, ticket_id)
    if row is None:
        raise NotFoundError("Maintenance ticket not found", code="ticket_not_found")
    return row


def create(db: Client, data: TicketCreate) -> TicketOut:
    if (
        data.complaint_id
        and get_by_id(db, "complaints", str(data.complaint_id)) is None
    ):
        raise NotFoundError("Complaint not found", code="complaint_not_found")
    if data.room_id and get_by_id(db, "rooms", str(data.room_id)) is None:
        raise NotFoundError("Room not found", code="room_not_found")
    payload = data.model_dump(mode="json")
    payload["status"] = "open"
    ticket = TicketOut.model_validate(insert(db, _TABLE, payload))
    # Linking a ticket to a complaint moves the complaint to 'assigned'.
    if data.complaint_id:
        db.table("complaints").update(
            {"status": "assigned", "updated_at": _now_iso()}
        ).eq("id", str(data.complaint_id)).execute()
    return ticket


def list_tickets(
    db: Client,
    user: dict,
    *,
    page: int,
    per_page: int,
    status: str | None,
    room_id: str | None,
    assigned_to: str | None,
    search: str | None,
) -> TicketList:
    if has_permission(db, user, "maintenance_tickets.view"):
        scope_assigned_to = assigned_to
    elif has_permission(db, user, "maintenance_tickets.view_own"):
        own_staff = get_staff_by_user(db, user["id"])
        if own_staff is None:
            # Deliberately empty, not a 403 — a role-only user with no staff
            # record yet shouldn't see a scary error, just nothing assigned.
            return TicketList(items=[], total=0, page=page, per_page=per_page)
        scope_assigned_to = str(own_staff["id"])  # forced — ignores any caller-supplied assigned_to
    else:
        raise ForbiddenError("You cannot view maintenance tickets", code="missing_permission")

    eq: dict = {}
    if status:
        eq["status"] = status
    if room_id:
        eq["room_id"] = room_id
    if scope_assigned_to:
        eq["assigned_to"] = scope_assigned_to
    items, total = list_page(
        db,
        _TABLE,
        page=page,
        per_page=per_page,
        select=_ROOM_SELECT,
        eq=eq or None,
        search=search,
        search_columns=("title", "description"),
        order="created_at",
        desc=True,
    )
    for i in items:
        _flatten_ticket_room(i)
    return TicketList(
        items=[TicketOut.model_validate(i) for i in items],
        total=total,
        page=page,
        per_page=per_page,
    )


def update_ticket(db: Client, user: dict, ticket_id: str, data: TicketUpdate) -> TicketOut:
    ticket = _fetch(db, ticket_id)
    payload = data.model_dump(mode="json", exclude_unset=True)

    if not has_permission(db, user, "maintenance_tickets.update"):
        own_staff = get_staff_by_user(db, user["id"])
        if own_staff is None or str(own_staff["id"]) != str(ticket["assigned_to"]):
            raise ForbiddenError("You can only update tickets assigned to you", code="not_your_ticket")
        if "assigned_to" in payload:
            raise ForbiddenError("You cannot reassign a ticket", code="cannot_reassign_ticket")
        if payload.get("status") == "cancelled":
            raise ForbiddenError("You cannot cancel a ticket", code="cannot_cancel_ticket")

    new_status = payload.get("status")
    if new_status and new_status != ticket["status"]:
        if new_status not in _ALLOWED_TRANSITIONS.get(ticket["status"], set()):
            raise ConflictError(
                f"Cannot move a ticket from '{ticket['status']}' to '{new_status}'",
                code="invalid_transition",
            )

    # Derive side-effect timestamps from status changes.
    if new_status == "assigned" and ticket["status"] == "open":
        payload["assigned_at"] = _now_iso()
    if new_status == "in_progress" and ticket["status"] in ("open", "assigned"):
        payload["started_at"] = _now_iso()
    if new_status == "resolved":
        payload["resolved_at"] = _now_iso()

    # Validate staff assignment target exists.
    if (
        payload.get("assigned_to")
        and get_by_id(db, "staff", payload["assigned_to"]) is None
    ):
        raise BadRequestError("Assigned staff record not found", code="staff_not_found")

    # update()'s plain "*" select doesn't embed room like list_tickets does,
    # so `updated.room` is always None here — harmless, since the frontend
    # never reads a PATCH response for display, only the re-fetched list.
    updated = TicketOut.model_validate(update(db, _TABLE, ticket_id, payload))

    if payload.get("assigned_to"):
        notify_staff(
            db,
            payload["assigned_to"],
            title="Ticket assigned",
            message=f"You've been assigned ticket '{updated.title}'.",
            reference_type="maintenance_ticket",
            reference_id=str(updated.id),
        )

    # Propagate terminal ticket state to the linked complaint, if any.
    if ticket.get("complaint_id") and new_status in ("resolved", "closed", "cancelled"):
        complaint_status = (
            "resolved" if new_status in ("resolved", "closed") else "cancelled"
        )
        db.table("complaints").update(
            {"status": complaint_status, "updated_at": _now_iso()}
        ).eq("id", ticket["complaint_id"]).execute()
        complaint = get_by_id(db, "complaints", ticket["complaint_id"])
        if complaint and complaint.get("resident_id"):
            notify_resident(
                db,
                str(complaint["resident_id"]),
                title="Complaint updated",
                message=f"Your complaint is now {complaint_status}.",
                reference_type="complaint",
                reference_id=str(ticket["complaint_id"]),
            )
    return updated
