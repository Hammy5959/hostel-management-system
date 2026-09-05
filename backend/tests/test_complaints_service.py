"""Unit tests for the complaint-status-change notify hook in
app.complaints.service.update_complaint (Fix 2).
"""

from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

from app.complaints.schemas import ComplaintUpdate
from app.complaints.service import update_complaint


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
