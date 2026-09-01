"""Meal record schemas."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MealMark(BaseModel):
    resident_id: UUID
    meal_date: date
    meal_type: str = Field(min_length=1, max_length=50)
    consumed: bool = False


class MealUpdate(BaseModel):
    meal_type: str | None = Field(default=None, min_length=1, max_length=50)
    consumed: bool | None = None


class MealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resident_id: UUID
    meal_date: date
    meal_type: str
    consumed: bool
    marked_by: UUID | None = None
    created_at: datetime


class MealList(BaseModel):
    items: list[MealOut]
    total: int
    page: int
    per_page: int
