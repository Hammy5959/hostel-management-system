"""Gate pass schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class GatePassCreate(BaseModel):
    resident_id: UUID
    reason: str = Field(min_length=1)
    destination: str | None = None
    departure_at: datetime | None = None
    expected_return_at: datetime | None = None
    notes: str | None = None


class GatePassAction(BaseModel):
    notes: str | None = None


class GatePassOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resident_id: UUID
    pass_number: str
    reason: str
    destination: str | None = None
    departure_at: datetime | None = None
    expected_return_at: datetime | None = None
    actual_return_at: datetime | None = None
    status: str
    requested_at: datetime
    approved_by: UUID | None = None
    approved_at: datetime | None = None
    issued_by: UUID | None = None
    issued_at: datetime | None = None
    verified_by: UUID | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class GatePassList(BaseModel):
    items: list[GatePassOut]
    total: int
    page: int
    per_page: int
