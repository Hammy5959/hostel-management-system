"""Unit test for app.attendance.service.bulk_mark's not-found message — must
not echo the raw resident_id back into a client-facing message."""

from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

from app.attendance.schemas import AttendanceBulkMark, AttendanceMark
from app.core.exceptions import NotFoundError


@patch("app.attendance.service.get_by_id")
def test_bulk_mark_unknown_resident_does_not_echo_resident_id(mock_get_by_id):
    mock_get_by_id.return_value = None
    resident_id = uuid4()
    data = AttendanceBulkMark(
        records=[AttendanceMark(resident_id=resident_id, attendance_date="2026-09-22", status="present")]
    )

    from app.attendance.service import bulk_mark

    try:
        bulk_mark(None, {"id": str(uuid4())}, data)
        assert False, "expected NotFoundError"
    except NotFoundError as exc:
        assert exc.message == "Resident not found"
        assert str(resident_id) not in exc.message
