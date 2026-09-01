"""Mess menu schemas."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class MenuCreate(BaseModel):
    menu_date: date
    breakfast: str | None = None
    lunch: str | None = None
    dinner: str | None = None
    notes: str | None = None


class MenuUpdate(BaseModel):
    breakfast: str | None = None
    lunch: str | None = None
    dinner: str | None = None
    notes: str | None = None


class MenuOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    menu_date: date
    breakfast: str | None = None
    lunch: str | None = None
    dinner: str | None = None
    notes: str | None = None
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class MenuList(BaseModel):
    items: list[MenuOut]
    total: int
    page: int
    per_page: int
