"""Unit tests for the new notify hooks in
app.maintenance_tickets.service.update_ticket:
- assigned_to set on the update -> notify_staff (Fix 4)
- a terminal status propagated onto a linked complaint -> notify_resident
  (Fix 2's ticket-driven complaint auto-resolution path)

Note: TicketUpdate.assigned_to is a pydantic UUID field, so
`data.model_dump(exclude_unset=True)["assigned_to"]` is a native UUID object,
not a string — staff_id below is built as a UUID (not str(uuid4())) so the
equality assertion against the notify_staff call's argument is meaningful.
"""

from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

from app.maintenance_tickets.schemas import TicketUpdate
from app.maintenance_tickets.service import update_ticket


def _ticket_row(**overrides) -> dict:
    now = "2026-09-05T00:00:00+00:00"
    row = {
        "id": str(uuid4()),
        "complaint_id": None,
        "title": "Broken AC",
        "description": "AC not cooling",
        "category": None,
        "priority": "normal",
        "room_id": None,
        "assigned_to": None,
        "status": "open",
        "assigned_at": None,
        "started_at": None,
        "resolved_at": None,
        "resolution_notes": None,
        "created_at": now,
        "updated_at": now,
    }
    row.update(overrides)
    return row


class _FakeResult:
    error = None


class _FakeComplaintsTable:
    def update(self, _payload):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        return _FakeResult()


class _FakeDb:
    def table(self, _name):
        return _FakeComplaintsTable()


@patch("app.maintenance_tickets.service.notify_resident")
@patch("app.maintenance_tickets.service.notify_staff")
@patch("app.maintenance_tickets.service.update")
@patch("app.maintenance_tickets.service.get_by_id")
@patch("app.maintenance_tickets.service._fetch")
def test_update_ticket_notifies_assigned_staff(
    mock_fetch, mock_get_by_id, mock_update, mock_notify_staff, mock_notify_resident,
):
    ticket = _ticket_row(status="open")
    staff_id = uuid4()
    mock_fetch.return_value = ticket
    mock_get_by_id.return_value = {"id": str(staff_id), "user_id": str(uuid4())}
    mock_update.return_value = _ticket_row(id=ticket["id"], status="assigned", assigned_to=str(staff_id))

    update_ticket(None, ticket["id"], TicketUpdate(assigned_to=staff_id, status="assigned"))

    mock_notify_staff.assert_called_once()
    args, kwargs = mock_notify_staff.call_args
    assert args[1] == staff_id
    assert kwargs["reference_type"] == "maintenance_ticket"
    mock_notify_resident.assert_not_called()


@patch("app.maintenance_tickets.service.notify_resident")
@patch("app.maintenance_tickets.service.notify_staff")
@patch("app.maintenance_tickets.service.update")
@patch("app.maintenance_tickets.service.get_by_id")
@patch("app.maintenance_tickets.service._fetch")
def test_update_ticket_no_staff_notify_when_assigned_to_not_in_payload(
    mock_fetch, mock_get_by_id, mock_update, mock_notify_staff, mock_notify_resident,
):
    ticket = _ticket_row(status="assigned")
    mock_fetch.return_value = ticket
    mock_update.return_value = _ticket_row(id=ticket["id"], status="in_progress")

    update_ticket(None, ticket["id"], TicketUpdate(status="in_progress"))

    mock_notify_staff.assert_not_called()


@patch("app.maintenance_tickets.service.notify_resident")
@patch("app.maintenance_tickets.service.notify_staff")
@patch("app.maintenance_tickets.service.update")
@patch("app.maintenance_tickets.service.get_by_id")
@patch("app.maintenance_tickets.service._fetch")
def test_update_ticket_resolves_linked_complaint_and_notifies_resident(
    mock_fetch, mock_get_by_id, mock_update, mock_notify_staff, mock_notify_resident,
):
    complaint_id = str(uuid4())
    resident_id = str(uuid4())
    ticket = _ticket_row(status="in_progress", complaint_id=complaint_id)
    mock_fetch.return_value = ticket
    mock_get_by_id.return_value = {"id": complaint_id, "resident_id": resident_id}
    mock_update.return_value = _ticket_row(id=ticket["id"], complaint_id=complaint_id, status="resolved")

    update_ticket(_FakeDb(), ticket["id"], TicketUpdate(status="resolved"))

    mock_notify_resident.assert_called_once()
    args, kwargs = mock_notify_resident.call_args
    assert args[1] == resident_id
    assert kwargs["reference_type"] == "complaint"


@patch("app.maintenance_tickets.service.notify_resident")
@patch("app.maintenance_tickets.service.notify_staff")
@patch("app.maintenance_tickets.service.update")
@patch("app.maintenance_tickets.service.get_by_id")
@patch("app.maintenance_tickets.service._fetch")
def test_update_ticket_no_complaint_notify_when_no_linked_complaint(
    mock_fetch, mock_get_by_id, mock_update, mock_notify_staff, mock_notify_resident,
):
    ticket = _ticket_row(status="in_progress", complaint_id=None)
    mock_fetch.return_value = ticket
    mock_update.return_value = _ticket_row(id=ticket["id"], status="resolved")

    update_ticket(None, ticket["id"], TicketUpdate(status="resolved"))

    mock_notify_resident.assert_not_called()
    mock_get_by_id.assert_not_called()
