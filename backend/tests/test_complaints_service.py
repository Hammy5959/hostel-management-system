"""Unit tests for the complaint-status-change notify hook in
app.complaints.service.update_complaint (Fix 2), and for the resident
self-withdraw endpoint in app.complaints.service.cancel_complaint.
"""

from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

import pytest

from app.complaints.schemas import ComplaintUpdate
from app.complaints.service import cancel_complaint, update_complaint
from app.core.exceptions import ConflictError, ForbiddenError


def _complaint_row(**overrides) -> dict:
    now = "2026-09-05T00:00:00+00:00"
    row = {
        "id": str(uuid4()),
        "resident_id": str(uuid4()),
        "title": "Leaky faucet",
        "description": "Kitchen faucet is leaking",
        "category": None,
        "priority": "normal",
        "status": "open",
        "room_id": None,
        "created_at": now,
        "updated_at": now,
    }
    row.update(overrides)
    return row


@patch("app.complaints.service.notify_resident")
@patch("app.complaints.service.update")
@patch("app.complaints.service._fetch")
def test_update_complaint_notifies_on_status_change(mock_fetch, mock_update, mock_notify_resident):
    complaint = _complaint_row(status="open")
    mock_fetch.return_value = complaint
    mock_update.return_value = _complaint_row(
        id=complaint["id"], resident_id=complaint["resident_id"], status="assigned",
    )

    result = update_complaint(None, complaint["id"], ComplaintUpdate(status="assigned"))

    mock_notify_resident.assert_called_once()
    args, kwargs = mock_notify_resident.call_args
    assert args[1] == complaint["resident_id"]
    assert kwargs["reference_type"] == "complaint"
    assert result.status == "assigned"


@patch("app.complaints.service.notify_resident")
@patch("app.complaints.service.update")
@patch("app.complaints.service._fetch")
def test_update_complaint_no_notify_when_status_unchanged(mock_fetch, mock_update, mock_notify_resident):
    complaint = _complaint_row(status="open")
    mock_fetch.return_value = complaint
    mock_update.return_value = _complaint_row(
        id=complaint["id"], resident_id=complaint["resident_id"], description="Updated description",
    )

    update_complaint(None, complaint["id"], ComplaintUpdate(description="Updated description"))

    mock_notify_resident.assert_not_called()


@patch("app.complaints.service.record_audit")
@patch("app.complaints.service.update")
@patch("app.complaints.service.get_resident_by_user")
@patch("app.complaints.service.has_permission")
@patch("app.complaints.service._fetch")
def test_cancel_complaint_resident_can_withdraw_own_open_complaint(
    mock_fetch, mock_has_permission, mock_get_resident, mock_update, mock_record_audit,
):
    resident_id = str(uuid4())
    complaint = _complaint_row(resident_id=resident_id, status="open")
    mock_fetch.return_value = complaint
    mock_has_permission.return_value = False  # not staff
    mock_get_resident.return_value = {"id": resident_id}
    mock_update.return_value = _complaint_row(
        id=complaint["id"], resident_id=resident_id, status="cancelled",
    )

    result = cancel_complaint(None, {"id": "user-1"}, complaint["id"])

    assert result.status == "cancelled"
    mock_update.assert_called_once_with(None, "complaints", complaint["id"], {"status": "cancelled"})
    mock_record_audit.assert_called_once()
    assert mock_record_audit.call_args.kwargs["action"] == "complaint.cancel"


@patch("app.complaints.service.get_resident_by_user")
@patch("app.complaints.service.has_permission")
@patch("app.complaints.service._fetch")
def test_cancel_complaint_forbidden_for_someone_elses_complaint(mock_fetch, mock_has_permission, mock_get_resident):
    complaint = _complaint_row(resident_id=str(uuid4()), status="open")
    mock_fetch.return_value = complaint
    mock_has_permission.return_value = False
    mock_get_resident.return_value = {"id": str(uuid4())}  # different resident

    with pytest.raises(ForbiddenError):
        cancel_complaint(None, {"id": "user-1"}, complaint["id"])


@patch("app.complaints.service.get_resident_by_user")
@patch("app.complaints.service.has_permission")
@patch("app.complaints.service._fetch")
def test_cancel_complaint_conflict_once_assigned(mock_fetch, mock_has_permission, mock_get_resident):
    resident_id = str(uuid4())
    complaint = _complaint_row(resident_id=resident_id, status="assigned")
    mock_fetch.return_value = complaint
    mock_has_permission.return_value = False
    mock_get_resident.return_value = {"id": resident_id}

    with pytest.raises(ConflictError):
        cancel_complaint(None, {"id": "user-1"}, complaint["id"])


@patch("app.complaints.service.record_audit")
@patch("app.complaints.service.update")
@patch("app.complaints.service.has_permission")
@patch("app.complaints.service._fetch")
def test_cancel_complaint_staff_still_blocked_once_assigned(
    mock_fetch, mock_has_permission, mock_update, mock_record_audit,
):
    # Staff (complaints.update) keep their existing PATCH-based state machine
    # for cancelling from assigned/in_progress; this new endpoint's status
    # guard is unconditional, so even staff get 409 here rather than a
    # second, looser cancel path.
    complaint = _complaint_row(resident_id=str(uuid4()), status="assigned")
    mock_fetch.return_value = complaint
    mock_has_permission.return_value = True  # staff with complaints.update

    with pytest.raises(ConflictError):
        cancel_complaint(None, {"id": "staff-1"}, complaint["id"])

    mock_update.assert_not_called()
    mock_record_audit.assert_not_called()
