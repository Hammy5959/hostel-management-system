"""Emergency contact schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EmergencyContactCreate(BaseModel):
    resident_id: UUID
    name: str = Field(min_length=1, max_length=200)
    relationship: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=1, max_length=50)
    alternate_phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    address: str | None = None
    is_primary: bool = False


class EmergencyContactUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    relationship: str | None = Field(default=None, min_length=1, max_length=100)
    phone: str | None = Field(default=None, min_length=1, max_length=50)
    alternate_phone: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    address: str | None = None
    is_primary: bool | None = None


class EmergencyContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resident_id: UUID
    name: str
    relationship: str
    phone: str
    alternate_phone: str | None = None
    email: str | None = None
    address: str | None = None
    is_primary: bool
    created_at: datetime
    updated_at: datetime


class EmergencyContactList(BaseModel):
    items: list[EmergencyContactOut]
    total: int
    page: int
    per_page: int
