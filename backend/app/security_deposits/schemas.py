"""Security deposit schemas."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DepositCreate(BaseModel):
    resident_id: UUID
    amount: Decimal = Field(ge=0)
    notes: str | None = None


class DepositUpdate(BaseModel):
    notes: str | None = None


class DepositReceive(BaseModel):
    notes: str | None = None


class DepositRefund(BaseModel):
    amount: Decimal = Field(gt=0)
    reference: str | None = Field(default=None, max_length=100)
    reason: str | None = None


class DepositDeduct(BaseModel):
    amount: Decimal = Field(gt=0)
    reason: str | None = None


class DepositOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resident_id: UUID
    amount: Decimal
    received_amount: Decimal
    refunded_amount: Decimal
    deducted_amount: Decimal
    status: str
    received_at: datetime | None = None
    refunded_at: datetime | None = None
    refund_reference: str | None = None
    deduction_reason: str | None = None
    notes: str | None = None
    received_by: UUID | None = None
    refunded_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class DepositList(BaseModel):
    items: list[DepositOut]
    total: int
    page: int
    per_page: int
