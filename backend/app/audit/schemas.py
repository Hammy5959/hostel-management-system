"""Audit log schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID | None = None
    action: str
    module: str
    entity_type: str | None = None
    entity_id: UUID | None = None
    description: str | None = None
    old_values: dict[str, Any] | None = None
    new_values: dict[str, Any] | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    created_at: datetime


class AuditLogList(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    per_page: int
