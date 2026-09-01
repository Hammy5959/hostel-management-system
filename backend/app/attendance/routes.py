"""Attendance endpoints."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.attendance import service
from app.attendance.schemas import (
    AttendanceBulkMark,
    AttendanceBulkResult,
    AttendanceList,
    AttendanceMark,
    AttendanceOut,
    AttendanceUpdate,
)
from app.core.permissions import require_any_permission, require_permission

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.get("", response_model=AttendanceList, summary="List attendance")
def list_attendance(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    resident_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    status: str | None = None,
    user: dict = Depends(require_any_permission("attendance.view", "attendance.view_own")),
    db: Client = Depends(get_db),
) -> AttendanceList:
    return service.list_attendance(db, user, page=page, per_page=per_page, resident_id=resident_id, date_from=date_from, date_to=date_to, status=status)


@router.post("", response_model=AttendanceOut, status_code=201, summary="Mark attendance for a resident")
def mark(
    payload: AttendanceMark,
    user: dict = Depends(require_permission("attendance.mark")),
    db: Client = Depends(get_db),
) -> AttendanceOut:
    return service.mark(db, user, payload)


@router.post("/bulk", response_model=AttendanceBulkResult, status_code=201, summary="Bulk mark attendance for multiple residents")
def bulk_mark(
    payload: AttendanceBulkMark,
    user: dict = Depends(require_permission("attendance.mark")),
    db: Client = Depends(get_db),
) -> AttendanceBulkResult:
    return service.bulk_mark(db, user, payload)


@router.patch("/{record_id}", response_model=AttendanceOut, summary="Update an attendance record")
def update_attendance(
    record_id: str,
    payload: AttendanceUpdate,
    _: dict = Depends(require_permission("attendance.update")),
    db: Client = Depends(get_db),
) -> AttendanceOut:
    return service.update_attendance(db, record_id, payload)
