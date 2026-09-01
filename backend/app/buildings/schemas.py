"""Building schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

BuildingType = Literal["boys", "girls", "mixed"]


class BuildingCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str | None = Field(default=None, max_length=50)
    description: str | None = None
    type: BuildingType = "mixed"
    is_active: bool = True


class BuildingUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = Field(default=None, max_length=50)
    description: str | None = None
    type: BuildingType | None = None
    is_active: bool | None = None


class BuildingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    code: str | None = None
    description: str | None = None
    type: BuildingType
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # Computed from `hms_building_occupancy()` — rooms/beds aggregated across
    # the building's floors. Not physical columns on `buildings`; always 0
    # for a building with no rooms yet.
    total_rooms: int = 0
    total_capacity: int = 0
    total_beds: int = 0
    occupied_beds: int = 0
    occupancy_rate: float = 0.0


class BuildingList(BaseModel):
    items: list[BuildingOut]
    total: int
    page: int
    per_page: int
