"""Unit tests for app.maintenance_tickets.service:
- the notify hooks in update_ticket (assigned_to -> notify_staff; a terminal
  status propagated onto a linked complaint -> notify_resident)
- the maintenance_tickets.view/.view_own scoping in list_tickets
- the maintenance_tickets.update/.update_own ownership + cancel/reassign
  guard in update_ticket

Note: TicketUpdate.assigned_to is a pydantic UUID field, but update_ticket
builds its payload via `data.model_dump(mode="json", exclude_unset=True)`,
which serializes it to a plain str — staff_id below is still built as a UUID
(not str(uuid4())) so the notify_staff assertion compares against str(staff_id)
explicitly rather than relying on UUID/str equality (which is always False).
"""

from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

import pytest

from app.core.exceptions import ForbiddenError
from app.maintenance_tickets.schemas import TicketUpdate
from app.maintenance_tickets.service import list_tickets, update_ticket

_ADMIN_USER = {"id": "admin-1"}


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


@patch("app.maintenance_tickets.service.has_permission")
@patch("app.maintenance_tickets.service.notify_resident")
@patch("app.maintenance_tickets.service.notify_staff")
@patch("app.maintenance_tickets.service.update")
@patch("app.maintenance_tickets.service.get_by_id")
@patch("app.maintenance_tickets.service._fetch")
def test_update_ticket_notifies_assigned_staff(
    mock_fetch, mock_get_by_id, mock_update, mock_notify_staff, mock_notify_resident, mock_has_permission,
):
    mock_has_permission.return_value = True  # admin/manager with full .update
    ticket = _ticket_row(status="open")
    staff_id = uuid4()
    mock_fetch.return_value = ticket
    mock_get_by_id.return_value = {"id": str(staff_id), "user_id": str(uuid4())}
    mock_update.return_value = _ticket_row(id=ticket["id"], status="assigned", assigned_to=str(staff_id))

    update_ticket(None, _ADMIN_USER, ticket["id"], TicketUpdate(assigned_to=staff_id, status="assigned"))

    mock_notify_staff.assert_called_once()
    args, kwargs = mock_notify_staff.call_args
    # update_ticket's payload is built via model_dump(mode="json", ...), so
    # assigned_to comes through as a str, not the original UUID instance.
    assert args[1] == str(staff_id)
    assert kwargs["reference_type"] == "maintenance_ticket"
    mock_notify_resident.assert_not_called()


@patch("app.maintenance_tickets.service.has_permission")
@patch("app.maintenance_tickets.service.notify_resident")
@patch("app.maintenance_tickets.service.notify_staff")
@patch("app.maintenance_tickets.service.update")
@patch("app.maintenance_tickets.service.get_by_id")
@patch("app.maintenance_tickets.service._fetch")
def test_update_ticket_no_staff_notify_when_assigned_to_not_in_payload(
    mock_fetch, mock_get_by_id, mock_update, mock_notify_staff, mock_notify_resident, mock_has_permission,
):
    mock_has_permission.return_value = True
    ticket = _ticket_row(status="assigned")
    mock_fetch.return_value = ticket
    mock_update.return_value = _ticket_row(id=ticket["id"], status="in_progress")

    update_ticket(None, _ADMIN_USER, ticket["id"], TicketUpdate(status="in_progress"))

    mock_notify_staff.assert_not_called()


@patch("app.maintenance_tickets.service.has_permission")
@patch("app.maintenance_tickets.service.notify_resident")
@patch("app.maintenance_tickets.service.notify_staff")
@patch("app.maintenance_tickets.service.update")
@patch("app.maintenance_tickets.service.get_by_id")
@patch("app.maintenance_tickets.service._fetch")
def test_update_ticket_resolves_linked_complaint_and_notifies_resident(
    mock_fetch, mock_get_by_id, mock_update, mock_notify_staff, mock_notify_resident, mock_has_permission,
):
    mock_has_permission.return_value = True
    complaint_id = str(uuid4())
    resident_id = str(uuid4())
    ticket = _ticket_row(status="in_progress", complaint_id=complaint_id)
    mock_fetch.return_value = ticket
    mock_get_by_id.return_value = {"id": complaint_id, "resident_id": resident_id}
    mock_update.return_value = _ticket_row(id=ticket["id"], complaint_id=complaint_id, status="resolved")

    update_ticket(_FakeDb(), _ADMIN_USER, ticket["id"], TicketUpdate(status="resolved"))

    mock_notify_resident.assert_called_once()
    args, kwargs = mock_notify_resident.call_args
    assert args[1] == resident_id
    assert kwargs["reference_type"] == "complaint"


@patch("app.maintenance_tickets.service.has_permission")
@patch("app.maintenance_tickets.service.notify_resident")
@patch("app.maintenance_tickets.service.notify_staff")
@patch("app.maintenance_tickets.service.update")
@patch("app.maintenance_tickets.service.get_by_id")
@patch("app.maintenance_tickets.service._fetch")
def test_update_ticket_no_complaint_notify_when_no_linked_complaint(
    mock_fetch, mock_get_by_id, mock_update, mock_notify_staff, mock_notify_resident, mock_has_permission,
):
    mock_has_permission.return_value = True
    ticket = _ticket_row(status="in_progress", complaint_id=None)
    mock_fetch.return_value = ticket
    mock_update.return_value = _ticket_row(id=ticket["id"], status="resolved")

    update_ticket(None, _ADMIN_USER, ticket["id"], TicketUpdate(status="resolved"))

    mock_notify_resident.assert_not_called()
    mock_get_by_id.assert_not_called()


# ── maintenance_tickets.update_own: ownership + cancel/reassign guard ──────


@patch("app.maintenance_tickets.service.has_permission")
@patch("app.maintenance_tickets.service.notify_staff")
@patch("app.maintenance_tickets.service.update")
@patch("app.maintenance_tickets.service.get_staff_by_user")
@patch("app.maintenance_tickets.service._fetch")
def test_update_own_can_progress_own_assigned_ticket(
    mock_fetch, mock_get_staff, mock_update, mock_notify_staff, mock_has_permission,
):
    staff_id = str(uuid4())
    ticket = _ticket_row(status="assigned", assigned_to=staff_id)
    mock_fetch.return_value = ticket
    mock_has_permission.return_value = False  # not a full-.update holder
    mock_get_staff.return_value = {"id": staff_id}
    mock_update.return_value = _ticket_row(id=ticket["id"], status="in_progress", assigned_to=staff_id)

    result = update_ticket(None, {"id": "staff-user-1"}, ticket["id"], TicketUpdate(status="in_progress"))

    assert result.status == "in_progress"
    mock_update.assert_called_once()


@patch("app.maintenance_tickets.service.has_permission")
@patch("app.maintenance_tickets.service.get_staff_by_user")
@patch("app.maintenance_tickets.service._fetch")
def test_update_own_forbidden_on_someone_elses_ticket(mock_fetch, mock_get_staff, mock_has_permission):
    ticket = _ticket_row(status="assigned", assigned_to=str(uuid4()))
    mock_fetch.return_value = ticket
    mock_has_permission.return_value = False
    mock_get_staff.return_value = {"id": str(uuid4())}  # different staff record

    with pytest.raises(ForbiddenError):
        update_ticket(None, {"id": "staff-user-1"}, ticket["id"], TicketUpdate(status="in_progress"))


@patch("app.maintenance_tickets.service.has_permission")
@patch("app.maintenance_tickets.service.get_staff_by_user")
@patch("app.maintenance_tickets.service._fetch")
def test_update_own_forbidden_when_no_linked_staff_record(mock_fetch, mock_get_staff, mock_has_permission):
    ticket = _ticket_row(status="assigned", assigned_to=str(uuid4()))
    mock_fetch.return_value = ticket
    mock_has_permission.return_value = False
    mock_get_staff.return_value = None

    with pytest.raises(ForbiddenError):
        update_ticket(None, {"id": "staff-user-1"}, ticket["id"], TicketUpdate(status="in_progress"))


@patch("app.maintenance_tickets.service.has_permission")
@patch("app.maintenance_tickets.service.get_staff_by_user")
@patch("app.maintenance_tickets.service._fetch")
def test_update_own_cannot_cancel(mock_fetch, mock_get_staff, mock_has_permission):
    staff_id = str(uuid4())
    ticket = _ticket_row(status="assigned", assigned_to=staff_id)
    mock_fetch.return_value = ticket
    mock_has_permission.return_value = False
    mock_get_staff.return_value = {"id": staff_id}

    with pytest.raises(ForbiddenError, match="cancel"):
        update_ticket(None, {"id": "staff-user-1"}, ticket["id"], TicketUpdate(status="cancelled"))


@patch("app.maintenance_tickets.service.has_permission")
@patch("app.maintenance_tickets.service.get_staff_by_user")
@patch("app.maintenance_tickets.service._fetch")
def test_update_own_cannot_reassign(mock_fetch, mock_get_staff, mock_has_permission):
    staff_id = str(uuid4())
    other_staff_id = uuid4()
    ticket = _ticket_row(status="assigned", assigned_to=staff_id)
    mock_fetch.return_value = ticket
    mock_has_permission.return_value = False
    mock_get_staff.return_value = {"id": staff_id}

    with pytest.raises(ForbiddenError, match="reassign"):
        update_ticket(None, {"id": "staff-user-1"}, ticket["id"], TicketUpdate(assigned_to=other_staff_id))


# ── maintenance_tickets.view/.view_own scoping in list_tickets ─────────────


@patch("app.maintenance_tickets.service.has_permission")
@patch("app.maintenance_tickets.service.list_page")
def test_list_tickets_full_view_is_unscoped(mock_list_page, mock_has_permission):
    mock_has_permission.side_effect = lambda db, user, perm: perm == "maintenance_tickets.view"
    mock_list_page.return_value = ([], 0)

    list_tickets(None, _ADMIN_USER, page=1, per_page=20, status=None, room_id=None, assigned_to=None, search=None)

    _, kwargs = mock_list_page.call_args
    assert kwargs["eq"] is None


@patch("app.maintenance_tickets.service.has_permission")
@patch("app.maintenance_tickets.service.get_staff_by_user")
@patch("app.maintenance_tickets.service.list_page")
def test_list_tickets_view_own_forces_assigned_to(mock_list_page, mock_get_staff, mock_has_permission):
    staff_id = str(uuid4())
    mock_has_permission.side_effect = lambda db, user, perm: perm == "maintenance_tickets.view_own"
    mock_get_staff.return_value = {"id": staff_id}
    mock_list_page.return_value = ([], 0)

    # Caller passes a different assigned_to — it must be ignored/overridden.
    list_tickets(
        None, {"id": "staff-user-1"}, page=1, per_page=20, status=None, room_id=None,
        assigned_to=str(uuid4()), search=None,
    )

    _, kwargs = mock_list_page.call_args
    assert kwargs["eq"] == {"assigned_to": staff_id}


@patch("app.maintenance_tickets.service.has_permission")
@patch("app.maintenance_tickets.service.get_staff_by_user")
def test_list_tickets_view_own_with_no_staff_record_is_empty_not_error(mock_get_staff, mock_has_permission):
    mock_has_permission.side_effect = lambda db, user, perm: perm == "maintenance_tickets.view_own"
    mock_get_staff.return_value = None

    result = list_tickets(
        None, {"id": "staff-user-1"}, page=1, per_page=20, status=None, room_id=None,
        assigned_to=None, search=None,
    )

    assert result.items == []
    assert result.total == 0


@patch("app.maintenance_tickets.service.has_permission")
def test_list_tickets_forbidden_with_no_permission(mock_has_permission):
    mock_has_permission.return_value = False

    with pytest.raises(ForbiddenError):
        list_tickets(None, {"id": "u1"}, page=1, per_page=20, status=None, room_id=None, assigned_to=None, search=None)
