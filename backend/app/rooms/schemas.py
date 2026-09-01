"""Room schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.buildings.schemas import BuildingType

RoomStatus = Literal["active", "inactive", "maintenance"]


class RoomResidentRef(BaseModel):
    """A resident with an active allocation to a bed in this room."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str | None = None


class RoomCreate(BaseModel):
    floor_id: UUID
    room_number: str = Field(min_length=1, max_length=50)
    room_type: str | None = Field(default=None, max_length=100)
    capacity: int = Field(gt=0)
    status: RoomStatus = "active"
    description: str | None = None


class RoomUpdate(BaseModel):
    room_number: str | None = Field(default=None, min_length=1, max_length=50)
    room_type: str | None = Field(default=None, max_length=100)
    capacity: int | None = Field(default=None, gt=0)
    status: RoomStatus | None = None
    description: str | None = None


class RoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    floor_id: UUID
    room_number: str
    room_type: str | None = None
    capacity: int
    status: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime

    # Joined via floor_id -> floors -> building_id -> buildings. Not physical
    # columns on `rooms`.
    floor_name: str | None = None
    building_id: UUID | None = None
    building_name: str | None = None
    building_type: BuildingType | None = None

    # Computed from this room's `beds` rows (embedded in the same query).
    # `occupied` mirrors `beds.status = 'occupied'`, the value the allocation
    # RPCs (hms_allocate_bed / hms_release_allocation / hms_transfer_allocation)
    # keep authoritative — never derived independently here.
    total_beds: int = 0
    occupied_beds: int = 0
    available_beds: int = 0

    # Residents with a currently-active `room_allocations` row for a bed in
    # this room. Empty until the (not-yet-built) allocations UI assigns one —
    # never hand-entered.
    current_residents: list[RoomResidentRef] = Field(default_factory=list)


class RoomSummaryOut(BaseModel):
    total_rooms: int
    occupied_rooms: int
    available_rooms: int
    full_rooms: int


class RoomList(BaseModel):
    items: list[RoomOut]
    total: int
    page: int
    per_page: int
    summary: RoomSummaryOut


# ── Room detail (bed management) ────────────────────────────────────────────
# Powers the /rooms/{room_id}/detail endpoint: real bed/resident/allocation/
# rent data for a single room, aggregated server-side so the frontend never
# derives business rules itself.

RentStatusValue = Literal["paid", "pending", "overdue", "no_dues"]


class RentStatusOut(BaseModel):
    """Computed fresh from this resident's invoices — never a stored/cached
    value, since `invoices.status = 'overdue'` isn't kept in sync by any
    scheduled job in this codebase."""

    status: RentStatusValue
    label: str
    days: int | None = None


class RoomDetailResidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str | None = None
    student_id: str | None = None
    program: str | None = None
    department: str | None = None
    semester: str | None = None
    profile_picture_url: str | None = None


class RoomDetailBedOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    bed_number: str
    status: str
    description: str | None = None

    # Populated only when a `room_allocations` row with status='active'
    # exists for this bed.
    allocation_id: UUID | None = None
    resident: RoomDetailResidentOut | None = None
    check_in_date: date | None = None
    rent_status: RentStatusOut | None = None


class RoomDetailSummaryOut(BaseModel):
    total_beds: int
    occupied_beds: int
    vacant_beds: int
    cleaning_beds: int


class RoomDetailOut(BaseModel):
    room: RoomOut
    summary: RoomDetailSummaryOut
    beds: list[RoomDetailBedOut]
