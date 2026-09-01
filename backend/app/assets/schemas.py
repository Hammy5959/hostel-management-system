"""Asset schemas."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

AssetStatus = Literal["available", "assigned", "damaged", "lost", "maintenance", "retired"]


class AssetCreate(BaseModel):
    inventory_item_id: UUID | None = None
    asset_number: str | None = Field(default=None, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    serial_number: str | None = Field(default=None, max_length=100)
    purchase_date: date | None = None
    purchase_cost: Decimal | None = Field(default=None, ge=0)
    status: AssetStatus = "available"
    condition: str | None = None
    notes: str | None = None


class AssetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    serial_number: str | None = Field(default=None, max_length=100)
    purchase_date: date | None = None
    purchase_cost: Decimal | None = Field(default=None, ge=0)
    status: AssetStatus | None = None
    condition: str | None = None
    notes: str | None = None


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    inventory_item_id: UUID | None = None
    asset_number: str
    name: str
    serial_number: str | None = None
    purchase_date: date | None = None
    purchase_cost: Decimal | None = None
    status: str
    condition: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class AssetList(BaseModel):
    items: list[AssetOut]
    total: int
    page: int
    per_page: int
