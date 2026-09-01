"""Permission schemas."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PermissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    module: str
    description: str | None = None
