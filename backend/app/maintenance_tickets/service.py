"""Maintenance ticket business logic.

Workflow mirrors complaints: open -> assigned -> in_progress -> resolved ->
closed (or cancelled). Assignment records the staff member and timestamp.
"""

from __future__ import annotations

from datetime import datetime, timezone

from supabase import Client

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.maintenance_tickets.schemas import TicketCreate, TicketList, TicketOut, TicketUpdate

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


def _fetch(db: Client, ticket_id: str) -> dict:
    row = get_by_id(db, _TABLE, ticket_id)
    if row is None:
        raise NotFoundError("Maintenance ticket not found", code="ticket_not_found")
    return row


def create(db: Client, data: TicketCreate) -> TicketOut:
    if data.complaint_id and get_by_id(db, "complaints", str(data.complaint_id)) is None:
        raise NotFoundError("Complaint not found", code="complaint_not_found")
    if data.room_id and get_by_id(db, "rooms", str(data.room_id)) is None:
        raise NotFoundError("Room not found", code="room_not_found")
    payload = data.model_dump(mode="json")
    payload["status"] = "open"
    ticket = TicketOut.model_validate(insert(db, _TABLE, payload))
    # Linking a ticket to a complaint moves the complaint to 'assigned'.
    if data.complaint_id:
        db.table("complaints").update({"status": "assigned", "updated_at": _now_iso()}).eq("id", str(data.complaint_id)).execute()
    return ticket


def list_tickets(
    db: Client,
    *,
    page: int,
    per_page: int,
    status: str | None,
    room_id: str | None,
    assigned_to: str | None,
    search: str | None,
) -> TicketList:
    eq: dict = {}
    if status:
        eq["status"] = status
    if room_id:
        eq["room_id"] = room_id
    if assigned_to:
        eq["assigned_to"] = assigned_to
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page, eq=eq or None,
        search=search, search_columns=("title", "description"),
        order="created_at", desc=True,
    )
    return TicketList(items=[TicketOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def update_ticket(db: Client, ticket_id: str, data: TicketUpdate) -> TicketOut:
    ticket = _fetch(db, ticket_id)
    payload = data.model_dump(exclude_unset=True)

    new_status = payload.get("status")
    if new_status and new_status != ticket["status"]:
        if new_status not in _ALLOWED_TRANSITIONS.get(ticket["status"], set()):
            raise ConflictError(
                f"Cannot move a ticket from '{ticket['status']}' to '{new_status}'", code="invalid_transition"
            )

    # Derive side-effect timestamps from status changes.
    if new_status == "assigned" and ticket["status"] == "open":
        payload["assigned_at"] = _now_iso()
    if new_status == "in_progress" and ticket["status"] in ("open", "assigned"):
        payload["started_at"] = _now_iso()
    if new_status == "resolved":
        payload["resolved_at"] = _now_iso()

    # Validate staff assignment target exists.
    if payload.get("assigned_to") and get_by_id(db, "staff", payload["assigned_to"]) is None:
        raise BadRequestError("Assigned staff record not found", code="staff_not_found")

    updated = TicketOut.model_validate(update(db, _TABLE, ticket_id, payload))

    # Propagate terminal ticket state to the linked complaint, if any.
    if ticket.get("complaint_id") and new_status in ("resolved", "closed", "cancelled"):
        complaint_status = "resolved" if new_status in ("resolved", "closed") else "cancelled"
        db.table("complaints").update({"status": complaint_status, "updated_at": _now_iso()}).eq("id", ticket["complaint_id"]).execute()
    return updated
