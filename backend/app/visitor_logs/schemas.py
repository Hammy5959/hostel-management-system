"""Visitor log schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class VisitorLogCheckIn(BaseModel):
    visitor_id: UUID
    remarks: str | None = None


class VisitorLogCheckOut(BaseModel):
    remarks: str | None = None


class VisitorLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    visitor_id: UUID
    check_in_at: datetime | None = None
    check_out_at: datetime | None = None
    checked_in_by: UUID | None = None
    checked_out_by: UUID | None = None
    remarks: str | None = None
    created_at: datetime


class VisitorLogList(BaseModel):
    items: list[VisitorLogOut]
    total: int
    page: int
    per_page: int
