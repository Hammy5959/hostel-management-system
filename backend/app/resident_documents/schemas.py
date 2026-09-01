"""Resident document schemas."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DocumentCreate(BaseModel):
    resident_id: UUID
    document_type: str = Field(min_length=1, max_length=100)
    document_number: str | None = Field(default=None, max_length=100)
    file_url: str = Field(min_length=1)


class DocumentUpdate(BaseModel):
    document_type: str | None = Field(default=None, min_length=1, max_length=100)
    document_number: str | None = Field(default=None, max_length=100)
    file_url: str | None = None


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resident_id: UUID
    document_type: str
    document_number: str | None = None
    file_url: str
    verified: bool
    uploaded_at: datetime
    verified_at: datetime | None = None
    verified_by: UUID | None = None


class DocumentList(BaseModel):
    items: list[DocumentOut]
    total: int
    page: int
    per_page: int
