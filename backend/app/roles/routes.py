"""Role management endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_any_permission, require_permission
from app.roles import service
from app.roles.schemas import RoleCreate, RoleOut, RolePermissionsUpdate, RoleUpdate, RoleWithPermissions

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("", response_model=list[RoleOut], summary="List roles")
def list_roles(
    include_inactive: bool = False,
    _: dict = Depends(require_any_permission("roles.view", "users.create")),
    db: Client = Depends(get_db),
) -> list[RoleOut]:
    return service.list_roles(db, include_inactive=include_inactive)


@router.post("", response_model=RoleOut, status_code=201, summary="Create a role")
def create_role(
    payload: RoleCreate,
    user: dict = Depends(require_permission("roles.manage")),
    db: Client = Depends(get_db),
) -> RoleOut:
    return service.create_role(db, payload, actor=user)


@router.get("/{role_id}", response_model=RoleWithPermissions, summary="Get a role with its permissions")
def get_role(
    role_id: str,
    _: dict = Depends(require_permission("roles.view")),
    db: Client = Depends(get_db),
) -> RoleWithPermissions:
    return service.get_role(db, role_id)


@router.patch("/{role_id}", response_model=RoleOut, summary="Update a role")
def update_role(
    role_id: str,
    payload: RoleUpdate,
    user: dict = Depends(require_permission("roles.manage")),
    db: Client = Depends(get_db),
) -> RoleOut:
    return service.update_role(db, role_id, payload, actor=user)


@router.put("/{role_id}/permissions", response_model=RoleWithPermissions, summary="Replace a role's permissions")
def set_permissions(
    role_id: str,
    payload: RolePermissionsUpdate,
    user: dict = Depends(require_permission("roles.manage")),
    db: Client = Depends(get_db),
) -> RoleWithPermissions:
    return service.set_role_permissions(db, role_id, payload, actor=user)


@router.delete("/{role_id}", status_code=204, summary="Delete a role (custom, unassigned only)")
def delete_role(
    role_id: str,
    user: dict = Depends(require_permission("roles.manage")),
    db: Client = Depends(get_db),
) -> None:
    """Delete a custom role. System roles and roles assigned to users are
    rejected with a clear business error (system_role_locked / role_in_use)."""
    service.delete_role(db, role_id, actor=user)
    return None
