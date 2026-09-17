"""Unit tests for audit coverage in app.admissions.service."""

from __future__ import annotations

from datetime import date
from unittest.mock import patch
from uuid import uuid4

from app.admissions.schemas import AdmissionCreate
from app.admissions.service import cancel_admission, create_admission


def _resident_row(**overrides) -> dict:
    row = {"id": str(uuid4()), "status": "inactive", "first_name": "Hamid", "last_name": None}
    row.update(overrides)
    return row


def _admission_row(**overrides) -> dict:
    row = {
        "id": str(uuid4()),
        "resident_id": str(uuid4()),
        "admission_number": "ADM-0001",
        "application_date": str(date.today()),
        "admission_date": None,
        "status": "pending",
        "notes": None,
        "created_by": str(uuid4()),
        "approved_by": None,
        "approved_at": None,
        "rejected_at": None,
        "created_at": "2026-09-05T00:00:00+00:00",
        "updated_at": "2026-09-05T00:00:00+00:00",
    }
    row.update(overrides)
    return row


@patch("app.admissions.service.record_audit")
@patch("app.admissions.service.insert")
@patch("app.admissions.service.list_page")
@patch("app.admissions.service.get_by_id")
def test_create_admission_records_audit(mock_get_by_id, mock_list_page, mock_insert, mock_record_audit):
    user = {"id": str(uuid4()), "_ip_address": "127.0.0.1", "_user_agent": "pytest"}
    resident = _resident_row()
    created_row = _admission_row(resident_id=resident["id"])
    mock_get_by_id.return_value = resident
    mock_list_page.return_value = ([], 0)
    mock_insert.return_value = created_row

    data = AdmissionCreate(resident_id=resident["id"])
    result = create_admission(None, user, data)

    mock_record_audit.assert_called_once()
    kwargs = mock_record_audit.call_args.kwargs
    assert kwargs["action"] == "admission.create"
    assert kwargs["module"] == "admissions"
    assert kwargs["user_id"] == user["id"]
    assert kwargs["ip_address"] == "127.0.0.1"
    assert kwargs["user_agent"] == "pytest"
    assert result.status == "pending"


@patch("app.admissions.service.record_audit")
@patch("app.admissions.service.update")
@patch("app.admissions.service.get_by_id")
def test_cancel_admission_records_real_actor(mock_get_by_id, mock_update, mock_record_audit):
    user = {"id": str(uuid4())}
    admission = _admission_row(status="pending")
    cancelled = _admission_row(id=admission["id"], status="cancelled")
    mock_get_by_id.return_value = admission
    mock_update.return_value = cancelled

    cancel_admission(None, user, admission["id"])

    mock_record_audit.assert_called_once()
    kwargs = mock_record_audit.call_args.kwargs
    assert kwargs["action"] == "admission.cancel"
    assert kwargs["user_id"] == user["id"]
