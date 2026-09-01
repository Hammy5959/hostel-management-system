"""Inventory category schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime


class CategoryList(BaseModel):
    items: list[CategoryOut]
    total: int
    page: int
    per_page: int
