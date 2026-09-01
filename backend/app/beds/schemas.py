"""Bed schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

BedStatus = Literal["available", "occupied", "cleaning", "maintenance"]


class BedCreate(BaseModel):
    room_id: UUID
    bed_number: str = Field(min_length=1, max_length=50)
    status: BedStatus = "available"
    description: str | None = None


class BedUpdate(BaseModel):
    bed_number: str | None = Field(default=None, min_length=1, max_length=50)
    status: BedStatus | None = None
    description: str | None = None


class BedOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    room_id: UUID
    bed_number: str
    status: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime


class BedList(BaseModel):
    items: list[BedOut]
    total: int
    page: int
    per_page: int
