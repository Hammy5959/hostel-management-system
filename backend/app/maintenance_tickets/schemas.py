"""Maintenance ticket schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

TicketStatus = Literal["open", "assigned", "in_progress", "resolved", "closed", "cancelled"]


class TicketCreate(BaseModel):
    complaint_id: UUID | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    category: str | None = Field(default=None, max_length=100)
    priority: Literal["low", "normal", "high", "urgent"] = "normal"
    room_id: UUID | None = None


class TicketUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    category: str | None = Field(default=None, max_length=100)
    priority: Literal["low", "normal", "high", "urgent"] | None = None
    room_id: UUID | None = None
    assigned_to: UUID | None = None
    resolution_notes: str | None = None
    status: TicketStatus | None = None


class TicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    complaint_id: UUID | None = None
    title: str
    description: str
    category: str | None = None
    priority: str
    room_id: UUID | None = None
    assigned_to: UUID | None = None
    status: str
    assigned_at: datetime | None = None
    started_at: datetime | None = None
    resolved_at: datetime | None = None
    resolution_notes: str | None = None
    created_at: datetime
    updated_at: datetime


class TicketList(BaseModel):
    items: list[TicketOut]
    total: int
    page: int
    per_page: int
