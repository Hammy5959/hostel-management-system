"""Invoice and invoice-item schemas."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class InvoiceItemCreate(BaseModel):
    fee_structure_id: UUID | None = None
    description: str = Field(min_length=1)
    quantity: Decimal = Field(default=Decimal("1"), gt=0)
    unit_amount: Decimal = Field(ge=0)


class InvoiceCreate(BaseModel):
    resident_id: UUID
    issue_date: date = Field(default_factory=date.today)
    due_date: date | None = None
    discount: Decimal = Field(default=Decimal("0"), ge=0)
    notes: str | None = None
    items: list[InvoiceItemCreate] = Field(default_factory=list)
    # Pending resident_charges rows to fold into this invoice as line items —
    # see app.invoices.service.create_invoice. Each is validated server-side
    # (belongs to resident_id, still pending) and its description/amount are
    # taken from the charge itself, never trusted from the client.
    resident_charge_ids: list[UUID] = Field(default_factory=list)


class InvoiceUpdate(BaseModel):
    due_date: date | None = None
    notes: str | None = None
    discount: Decimal | None = Field(default=None, ge=0)


class InvoiceItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    invoice_id: UUID
    fee_structure_id: UUID | None = None
    description: str
    quantity: Decimal
    unit_amount: Decimal
    total_amount: Decimal


class InvoiceResidentRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str | None = None
    student_id: str | None = None
    profile_picture_url: str | None = None


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resident_id: UUID
    invoice_number: str
    issue_date: date
    due_date: date | None = None
    subtotal: Decimal
    discount: Decimal
    total_amount: Decimal
    status: str
    notes: str | None = None
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    items: list[InvoiceItemOut] | None = None
    resident: InvoiceResidentRef | None = None
    # Computed fresh every time (sum of completed payments against this
    # invoice), never stored — see app.invoices.service._fetch_amount_paid_by_invoice.
    amount_paid: Decimal = Decimal("0")
    balance: Decimal = Decimal("0")


class InvoiceSummaryOut(BaseModel):
    total: int
    draft: int
    issued_unpaid: int
    paid: int


class InvoiceList(BaseModel):
    items: list[InvoiceOut]
    total: int
    page: int
    per_page: int
    summary: InvoiceSummaryOut
