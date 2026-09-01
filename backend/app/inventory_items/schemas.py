"""Inventory item schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.exceptions import BadRequestError


class InventoryItemCreate(BaseModel):
    category_id: UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    sku: str | None = Field(default=None, max_length=100)
    description: str | None = None
    quantity: int = Field(default=0, ge=0)
    minimum_quantity: int = Field(default=0, ge=0)
    unit: str | None = Field(default=None, max_length=50)


class InventoryItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    sku: str | None = Field(default=None, max_length=100)
    description: str | None = None
    quantity: int | None = Field(default=None, ge=0)
    minimum_quantity: int | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=50)


class StockAdjustment(BaseModel):
    """Delta-based stock change; quantity can never go below zero."""
    delta: int
    reason: str | None = None

    @model_validator(mode="after")
    def _delta_not_zero(self):
        if self.delta == 0:
            raise BadRequestError("delta must be non-zero", code="invalid_delta")
        return self


class InventoryItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    category_id: UUID | None = None
    name: str
    sku: str | None = None
    description: str | None = None
    quantity: int
    minimum_quantity: int
    unit: str | None = None
    created_at: datetime
    updated_at: datetime


class InventoryItemList(BaseModel):
    items: list[InventoryItemOut]
    total: int
    page: int
    per_page: int
