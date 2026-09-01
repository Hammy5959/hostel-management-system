"""Resident charge schemas."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ChargeStatus = Literal["pending", "invoiced", "paid", "partially_paid", "waived", "cancelled", "overdue"]


class ResidentChargeCreate(BaseModel):
    resident_id: UUID
    fee_structure_id: UUID | None = None
    charge_type: str = Field(min_length=1, max_length=100)
    description: str | None = None
    amount: Decimal = Field(ge=0)
    charge_date: date = Field(default_factory=date.today)
    due_date: date | None = None
    reference_type: str | None = None
    reference_id: UUID | None = None


class ResidentChargeUpdate(BaseModel):
    description: str | None = None
    due_date: date | None = None
    status: ChargeStatus | None = None
    amount_paid: Decimal | None = Field(default=None, ge=0)


class ResidentChargeResidentRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str | None = None
    student_id: str | None = None
    profile_picture_url: str | None = None


class ResidentChargeFeeStructureRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    amount: Decimal
    frequency: str


class ResidentChargeInvoiceRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    invoice_number: str


class ResidentChargeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resident_id: UUID
    fee_structure_id: UUID | None = None
    charge_type: str
    description: str | None = None
    amount: Decimal
    amount_paid: Decimal = Decimal("0")
    charge_date: date
    due_date: date | None = None
    status: str
    reference_type: str | None = None
    reference_id: UUID | None = None
    invoice_id: UUID | None = None
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    # Computed fresh every time (amount - amount_paid), never stored — see
    # app.resident_charges.service._with_extras.
    balance: Decimal = Decimal("0")
    # Resolved from the resident's active room_allocations row, not a
    # physical column — see app.resident_charges.service._fetch_current_room_by_resident.
    room_number: str | None = None
    resident: ResidentChargeResidentRef | None = None
    fee_structure: ResidentChargeFeeStructureRef | None = None
    invoice: ResidentChargeInvoiceRef | None = None


class ResidentChargeSummaryOut(BaseModel):
    total: int
    pending: int
    invoiced: int
    paid: int


class ResidentChargeList(BaseModel):
    items: list[ResidentChargeOut]
    total: int
    page: int
    per_page: int
    summary: ResidentChargeSummaryOut
