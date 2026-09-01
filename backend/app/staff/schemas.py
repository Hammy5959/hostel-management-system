"""Staff record schemas."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StaffCreate(BaseModel):
    user_id: UUID
    employee_number: str | None = Field(default=None, max_length=100)
    joining_date: date | None = None
    designation: str | None = Field(default=None, max_length=200)
    department: str | None = Field(default=None, max_length=200)
    address: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    emergency_contact_relationship: str | None = None
    is_active: bool = True


class StaffUpdate(BaseModel):
    employee_number: str | None = Field(default=None, max_length=100)
    joining_date: date | None = None
    designation: str | None = Field(default=None, max_length=200)
    department: str | None = Field(default=None, max_length=200)
    address: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    emergency_contact_relationship: str | None = None
    is_active: bool | None = None


class StaffUserRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    first_name: str
    last_name: str | None = None
    email: str
    phone: str | None = None
    role_id: UUID | None = None
    status: str | None = None


class StaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    employee_number: str | None = None
    joining_date: date | None = None
    designation: str | None = None
    department: str | None = None
    address: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    emergency_contact_relationship: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    user: StaffUserRef | None = None


class StaffList(BaseModel):
    items: list[StaffOut]
    total: int
    page: int
    per_page: int
