"""Complaint schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ComplaintStatus = Literal["open", "assigned", "in_progress", "resolved", "closed", "cancelled"]


class ComplaintCreate(BaseModel):
    resident_id: UUID
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    category: str | None = Field(default=None, max_length=100)
    priority: Literal["low", "normal", "high", "urgent"] = "normal"
    room_id: UUID | None = None


class ComplaintUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    category: str | None = Field(default=None, max_length=100)
    priority: Literal["low", "normal", "high", "urgent"] | None = None
    room_id: UUID | None = None
    status: ComplaintStatus | None = None


class ComplaintOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resident_id: UUID
    title: str
    description: str
    category: str | None = None
    priority: str
    status: str
    room_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class ComplaintList(BaseModel):
    items: list[ComplaintOut]
    total: int
    page: int
    per_page: int
