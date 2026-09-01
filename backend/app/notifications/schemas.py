"""Notification schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

Priority = Literal["low", "normal", "high", "urgent"]


class NotificationCreate(BaseModel):
    """Used by system processes (internal) and optionally staff."""

    user_id: UUID
    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1)
    type: str = Field(default="system", max_length=50)
    priority: Priority = "normal"
    reference_type: str | None = Field(default=None, max_length=50)
    reference_id: UUID | None = None


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    title: str
    message: str
    type: str
    priority: str
    is_read: bool
    read_at: datetime | None = None
    reference_type: str | None = None
    reference_id: UUID | None = None
    created_at: datetime


class NotificationList(BaseModel):
    items: list[NotificationOut]
    total: int
    page: int
    per_page: int
