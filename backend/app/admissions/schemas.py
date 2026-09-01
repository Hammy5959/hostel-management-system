"""Admission schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

AdmissionStatus = Literal["pending", "approved", "rejected", "cancelled"]


class AdmissionCreate(BaseModel):
    resident_id: UUID
    admission_number: str | None = Field(default=None, max_length=100)
    application_date: date = Field(default_factory=date.today)
    admission_date: date | None = None
    notes: str | None = None


class AdmissionUpdate(BaseModel):
    admission_date: date | None = None
    notes: str | None = None


class AdmissionResidentRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str | None = None
    student_id: str | None = None
    profile_picture_url: str | None = None
    program: str | None = None
    semester: str | None = None
    institution: str | None = None


class AdmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resident_id: UUID
    admission_number: str
    application_date: date
    admission_date: date | None = None
    status: str
    notes: str | None = None
    created_by: UUID | None = None
    approved_by: UUID | None = None
    approved_at: datetime | None = None
    rejected_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    # Only populated by list_admissions (embedded join) — bare on create/get/
    # transition responses, mirroring ResidentOut.user's same precedent.
    resident: AdmissionResidentRef | None = None


class AdmissionList(BaseModel):
    items: list[AdmissionOut]
    total: int
    page: int
    per_page: int
