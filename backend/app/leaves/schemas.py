"""Leave request schemas."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.exceptions import BadRequestError


class LeaveCreate(BaseModel):
    resident_id: UUID
    start_date: date
    end_date: date
    reason: str = Field(min_length=1)
    destination: str | None = None
    contact_phone: str | None = None

    @model_validator(mode="after")
    def _dates_valid(self):
        if self.end_date < self.start_date:
            raise BadRequestError("end_date cannot be before start_date", code="invalid_date_range")
        return self


class LeaveReview(BaseModel):
    review_notes: str | None = None


class LeaveOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resident_id: UUID
    start_date: date
    end_date: date
    reason: str
    destination: str | None = None
    contact_phone: str | None = None
    status: str
    requested_at: datetime
    reviewed_by: UUID | None = None
    reviewed_at: datetime | None = None
    review_notes: str | None = None
    created_at: datetime
    updated_at: datetime


class LeaveList(BaseModel):
    items: list[LeaveOut]
    total: int
    page: int
    per_page: int
