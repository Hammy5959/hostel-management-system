"""Attendance schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

AttendanceStatus = Literal["present", "absent", "late", "excused"]


class AttendanceMark(BaseModel):
    resident_id: UUID
    attendance_date: date
    status: AttendanceStatus
    remarks: str | None = None


class AttendanceUpdate(BaseModel):
    status: AttendanceStatus | None = None
    remarks: str | None = None


class AttendanceBulkMark(BaseModel):
    records: list[AttendanceMark] = Field(min_length=1)


class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resident_id: UUID
    attendance_date: date
    status: str
    remarks: str | None = None
    marked_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class AttendanceList(BaseModel):
    items: list[AttendanceOut]
    total: int
    page: int
    per_page: int


class AttendanceBulkSkipped(BaseModel):
    resident_id: UUID
    attendance_date: date
    reason: str


class AttendanceBulkResult(BaseModel):
    created: list[AttendanceOut]
    skipped: list[AttendanceBulkSkipped]
    created_count: int
    skipped_count: int
