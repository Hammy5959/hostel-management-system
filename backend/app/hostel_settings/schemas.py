"""Hostel settings schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class HostelSettingsCreate(BaseModel):
    hostel_name: str = Field(min_length=1, max_length=200)
    hostel_code: str | None = Field(default=None, max_length=50)
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    phone: str | None = None
    email: str | None = None
    total_capacity: int | None = Field(default=None, ge=0)


class HostelSettingsUpdate(BaseModel):
    hostel_name: str | None = Field(default=None, min_length=1, max_length=200)
    hostel_code: str | None = Field(default=None, max_length=50)
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    phone: str | None = None
    email: str | None = None
    total_capacity: int | None = Field(default=None, ge=0)


class HostelSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    hostel_name: str
    hostel_code: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    phone: str | None = None
    email: str | None = None
    total_capacity: int | None = None
    created_at: datetime
    updated_at: datetime
