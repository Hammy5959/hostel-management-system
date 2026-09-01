"""Payment schemas."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PaymentCreate(BaseModel):
    resident_id: UUID
    invoice_id: UUID
    payment_reference: str | None = Field(default=None, max_length=100)
    amount: Decimal = Field(gt=0)
    payment_method: str | None = Field(default=None, max_length=50)
    transaction_reference: str | None = Field(default=None, max_length=100)
    notes: str | None = None


class PaymentResidentRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str | None = None
    student_id: str | None = None
    profile_picture_url: str | None = None


class PaymentInvoiceRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    invoice_number: str


class PaymentReceivedByRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str | None = None


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resident_id: UUID
    invoice_id: UUID | None = None
    payment_reference: str
    amount: Decimal
    payment_method: str | None = None
    payment_date: datetime
    status: str
    transaction_reference: str | None = None
    notes: str | None = None
    received_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    # Joined for the Payments list/detail UI — see app.payments.service._SELECT.
    # Absent (None) on the row returned directly by hms_record_payment.
    resident: PaymentResidentRef | None = None
    invoice: PaymentInvoiceRef | None = None
    received_by_user: PaymentReceivedByRef | None = None


class PaymentSummaryOut(BaseModel):
    total_collected: Decimal
    this_month: Decimal
    total_payments: int
    outstanding: Decimal


class PaymentList(BaseModel):
    items: list[PaymentOut]
    total: int
    page: int
    per_page: int
    summary: PaymentSummaryOut
