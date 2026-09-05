"""Notice schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

AudienceType = Literal["all", "building", "floor"]


class NoticeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    category: str | None = Field(default=None, max_length=100)
    expires_at: datetime | None = None
    audience_type: AudienceType = "all"
    audience_building_id: UUID | None = None
    audience_floor_id: UUID | None = None


class NoticeUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = None
    category: str | None = Field(default=None, max_length=100)
    expires_at: datetime | None = None
    audience_type: AudienceType | None = None
    audience_building_id: UUID | None = None
    audience_floor_id: UUID | None = None


class NoticeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    content: str
    category: str | None = None
    is_published: bool
    published_at: datetime | None = None
    expires_at: datetime | None = None
    audience_type: AudienceType = "all"
    audience_building_id: UUID | None = None
    audience_floor_id: UUID | None = None
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class NoticeList(BaseModel):
    items: list[NoticeOut]
    total: int
    page: int
    per_page: int
