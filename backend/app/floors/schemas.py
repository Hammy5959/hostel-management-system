"""Floor schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class FloorCreate(BaseModel):
    building_id: UUID
    name: str = Field(min_length=1, max_length=200)
    floor_number: int = Field(ge=0)
    description: str | None = None


class FloorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    floor_number: int | None = Field(default=None, ge=0)
    description: str | None = None


class FloorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    building_id: UUID
    name: str
    floor_number: int
    description: str | None = None
    created_at: datetime
    updated_at: datetime

    # `buildings.name` via the building_id FK — not a physical column.
    building_name: str | None = None

    # Computed from `hms_floor_occupancy()` — rooms/beds aggregated for this
    # floor. Occupied beds mirror the same `beds.status = 'occupied'` value
    # the allocation RPCs keep authoritative. Always 0 for a floor with no
    # rooms yet.
    total_rooms: int = 0
    total_beds: int = 0
    occupied_beds: int = 0
    available_beds: int = 0
    occupancy_rate: float = 0.0


class FloorList(BaseModel):
    items: list[FloorOut]
    total: int
    page: int
    per_page: int
