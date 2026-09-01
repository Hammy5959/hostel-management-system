"""Room allocation schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

AllocationStatus = Literal["active", "transferred", "completed", "cancelled"]
PaymentStatusValue = Literal["paid", "pending", "overdue", "no_dues"]


class AllocationCreate(BaseModel):
    resident_id: UUID
    room_id: UUID
    bed_id: UUID
    admission_id: UUID | None = None
    allocated_from: date = Field(default_factory=date.today)
    allocated_until: date | None = None
    reason: str | None = None


class AllocationTransfer(BaseModel):
    new_room_id: UUID
    new_bed_id: UUID
    reason: str | None = None


class AllocationResidentRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str | None = None
    student_id: str | None = None
    profile_picture_url: str | None = None


class PaymentStatusOut(BaseModel):
    """Computed fresh from the resident's invoices — same computation as the
    Room Detail page's rent status, never a stored/cached value (see
    app.rooms.service._compute_rent_status)."""

    status: PaymentStatusValue
    label: str
    days: int | None = None


class AllocationBedRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    bed_number: str


class AllocationRoomRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    room_number: str
    # Joined via room_id -> floors -> building_id -> buildings, flattened
    # server-side in app.allocations.service._flatten_room_location. Not
    # physical columns on `rooms`.
    floor_name: str | None = None
    building_name: str | None = None


class AllocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resident_id: UUID
    room_id: UUID
    bed_id: UUID
    admission_id: UUID | None = None
    allocated_from: date
    allocated_until: date | None = None
    status: str
    reason: str | None = None
    allocated_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    resident: AllocationResidentRef | None = None
    room: AllocationRoomRef | None = None
    bed: AllocationBedRef | None = None
    payment_status: PaymentStatusOut | None = None


class AllocationSummaryOut(BaseModel):
    total_beds: int
    occupied_beds: int
    available_beds: int
    pending_payments: int


class AllocationList(BaseModel):
    items: list[AllocationOut]
    total: int
    page: int
    per_page: int
    summary: AllocationSummaryOut
