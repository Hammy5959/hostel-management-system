"""Resident stay (check-in/check-out) schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class StayCreate(BaseModel):
    resident_id: UUID
    allocation_id: UUID
    expected_check_out_at: datetime | None = None
    notes: str | None = None


class StayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resident_id: UUID
    allocation_id: UUID
    check_in_at: datetime | None = None
    expected_check_out_at: datetime | None = None
    actual_check_out_at: datetime | None = None
    status: str
    check_in_by: UUID | None = None
    check_out_by: UUID | None = None
    check_in_notes: str | None = None
    check_out_notes: str | None = None
    created_at: datetime
    updated_at: datetime


class StayCheckIn(BaseModel):
    notes: str | None = None


class StayCheckOut(BaseModel):
    notes: str | None = None


class StayList(BaseModel):
    items: list[StayOut]
    total: int
    page: int
    per_page: int
