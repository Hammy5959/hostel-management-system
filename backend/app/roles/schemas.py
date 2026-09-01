"""Role schemas."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9_]+$")
    description: str | None = None
    is_active: bool = True
    # is_system_role is intentionally absent: system roles are created only by
    # the seeder. API-created roles are always custom.


class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100, pattern=r"^[a-z0-9_]+$")
    description: str | None = None
    is_active: bool | None = None


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None = None
    is_system_role: bool
    is_active: bool


class RoleWithPermissions(RoleOut):
    permissions: list[str] = Field(default_factory=list)


class RolePermissionsUpdate(BaseModel):
    # Empty list clears the role's permissions (a role may be stripped).
    permission_ids: list[UUID] = Field(default_factory=list)
