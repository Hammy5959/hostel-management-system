"""Fee structure schemas."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

FeeStructureDateStatus = Literal["current", "continuous", "not_yet_active", "expired"]


class FeeStructureCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    amount: Decimal = Field(ge=0)
    frequency: str = Field(min_length=1, max_length=50)
    is_active: bool = True
    effective_from: date | None = None
    effective_until: date | None = None


class FeeStructureUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    amount: Decimal | None = Field(default=None, ge=0)
    frequency: str | None = Field(default=None, min_length=1, max_length=50)
    is_active: bool | None = None
    effective_from: date | None = None
    effective_until: date | None = None


class FeeStructureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None = None
    amount: Decimal
    frequency: str
    is_active: bool
    effective_from: date | None = None
    effective_until: date | None = None
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    # Computed fresh every time (see app.fee_structures.service.compute_availability)
    # — never stored, so an expired/not-yet-started row is always accurate.
    date_status: FeeStructureDateStatus
    is_currently_usable: bool


class FeeStructureSummaryOut(BaseModel):
    total: int
    active: int
    inactive: int


class FeeStructureList(BaseModel):
    items: list[FeeStructureOut]
    total: int
    page: int
    per_page: int
    summary: FeeStructureSummaryOut
