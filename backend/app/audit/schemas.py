"""Audit log schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AuditLogActor(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str | None = None
    email: str


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
    # Populated via the `actor:users(...)` embed in app.audit.routes —
    # None for system/unattributed actions (user_id IS NULL).
    actor: AuditLogActor | None = None


class AuditLogList(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    per_page: int
