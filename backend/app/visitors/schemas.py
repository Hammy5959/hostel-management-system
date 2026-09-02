"""Visitor registration schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class VisitorCreate(BaseModel):
    resident_id: UUID
    visitor_name: str = Field(min_length=1, max_length=200)
    visitor_phone: str | None = Field(default=None, max_length=50)
    relationship: str | None = Field(default=None, max_length=100)
    identification_type: str | None = Field(default=None, max_length=50)
    identification_number: str | None = Field(default=None, max_length=100)
    purpose: str | None = None
    expected_at: datetime | None = None


class VisitorUpdate(BaseModel):
    visitor_name: str | None = Field(default=None, min_length=1, max_length=200)
    visitor_phone: str | None = Field(default=None, max_length=50)
    relationship: str | None = Field(default=None, max_length=100)
    identification_type: str | None = Field(default=None, max_length=50)
    identification_number: str | None = Field(default=None, max_length=100)
    purpose: str | None = None
    expected_at: datetime | None = None
    is_blacklisted: bool | None = None


class VisitorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resident_id: UUID
    visitor_name: str
    visitor_phone: str | None = None
    relationship: str | None = None
    identification_type: str | None = None
    identification_number: str | None = None
    purpose: str | None = None
    expected_at: datetime | None = None
    status: str
    is_blacklisted: bool = False
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class VisitorList(BaseModel):
    items: list[VisitorOut]
    total: int
    page: int
    per_page: int
