"""Resident schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ResidentStatus = Literal["applicant", "active", "on_leave", "checked_out", "inactive"]


class ResidentCreate(BaseModel):
    user_id: UUID | None = None
    student_id: str | None = Field(default=None, max_length=100)
    first_name: str = Field(min_length=1, max_length=200)
    last_name: str | None = Field(default=None, max_length=200)
    date_of_birth: date | None = None
    gender: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    profile_picture_url: str | None = None
    address: str | None = None
    institution: str | None = Field(default=None, max_length=200)
    department: str | None = Field(default=None, max_length=200)
    program: str | None = Field(default=None, max_length=200)
    semester: str | None = Field(default=None, max_length=100)
    guardian_name: str | None = None
    guardian_relationship: str | None = None
    guardian_phone: str | None = None
    guardian_address: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_relationship: str | None = None
    emergency_contact_phone: str | None = None
    status: ResidentStatus = "applicant"


class ResidentUpdate(BaseModel):
    user_id: UUID | None = None
    student_id: str | None = Field(default=None, max_length=100)
    first_name: str | None = Field(default=None, min_length=1, max_length=200)
    last_name: str | None = Field(default=None, max_length=200)
    date_of_birth: date | None = None
    gender: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    profile_picture_url: str | None = None
    address: str | None = None
    institution: str | None = Field(default=None, max_length=200)
    department: str | None = Field(default=None, max_length=200)
    program: str | None = Field(default=None, max_length=200)
    semester: str | None = Field(default=None, max_length=100)
    guardian_name: str | None = None
    guardian_relationship: str | None = None
    guardian_phone: str | None = None
    guardian_address: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_relationship: str | None = None
    emergency_contact_phone: str | None = None


class ResidentCheckoutInput(BaseModel):
    reason: str | None = None


class ResidentUserRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str | None = None
    status: str | None = None


class ResidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID | None = None
    student_id: str | None = None
    first_name: str
    last_name: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    email: str | None = None
    phone: str | None = None
    profile_picture_url: str | None = None
    address: str | None = None
    institution: str | None = None
    department: str | None = None
    program: str | None = None
    semester: str | None = None
    guardian_name: str | None = None
    guardian_relationship: str | None = None
    guardian_phone: str | None = None
    guardian_address: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_relationship: str | None = None
    emergency_contact_phone: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    user: ResidentUserRef | None = None


class ResidentSummaryOut(BaseModel):
    total: int
    active: int
    on_leave: int
    applicant: int


class ResidentList(BaseModel):
    items: list[ResidentOut]
    total: int
    page: int
    per_page: int
    summary: ResidentSummaryOut
