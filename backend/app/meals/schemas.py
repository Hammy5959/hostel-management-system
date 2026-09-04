"""Meal record schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

MealType = Literal["breakfast", "lunch", "dinner"]


class MealMark(BaseModel):
    resident_id: UUID
    meal_date: date
    meal_type: MealType
    consumed: bool = False


class MealUpdate(BaseModel):
    meal_type: MealType | None = None
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


class MealBulkEntry(BaseModel):
    resident_id: UUID
    consumed: bool = False


class MealBulkMark(BaseModel):
    meal_date: date
    meal_type: MealType
    entries: list[MealBulkEntry] = Field(min_length=1)


class MealBulkFailure(BaseModel):
    resident_id: UUID
    code: str
    message: str


class MealBulkResult(BaseModel):
    marked: list[MealOut]
    failed: list[MealBulkFailure]
    marked_count: int
    failed_count: int


class MealRegisterEntry(BaseModel):
    resident_id: UUID
    first_name: str
    last_name: str | None = None
    meal_id: UUID | None = None
    consumed: bool


class MealRegister(BaseModel):
    meal_date: date
    meal_type: MealType
    items: list[MealRegisterEntry]
    total: int
