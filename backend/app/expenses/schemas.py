"""Expense schemas."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ExpenseCreate(BaseModel):
    expense_number: str | None = Field(default=None, max_length=100)
    category: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1)
    amount: Decimal = Field(gt=0)
    expense_date: date = Field(default_factory=date.today)
    vendor: str | None = Field(default=None, max_length=200)
    payment_method: str | None = Field(default=None, max_length=50)
    receipt_url: str | None = None


class ExpenseUpdate(BaseModel):
    category: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, min_length=1)
    amount: Decimal | None = Field(default=None, gt=0)
    expense_date: date | None = None
    vendor: str | None = Field(default=None, max_length=200)
    payment_method: str | None = Field(default=None, max_length=50)
    receipt_url: str | None = None


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    expense_number: str
    category: str
    description: str
    amount: Decimal
    expense_date: date
    vendor: str | None = None
    payment_method: str | None = None
    receipt_url: str | None = None
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class ExpenseList(BaseModel):
    items: list[ExpenseOut]
    total: int
    page: int
    per_page: int
