"""Role business logic.

Lifecycle rules
---------------
- **System roles** (``is_system_role=true``, seeded, e.g. super_admin) can be
  viewed but never renamed, deactivated or deleted.
- **Custom roles** can be created, renamed, activated/deactivated and deleted.
- A custom role **assigned to users** cannot be hard-deleted (``role_in_use``);
  deactivate it instead.
- Deleting a role preserves audit history: audit rows carry the role name in
  ``description`` and ``entity_id`` (no FK to roles).
- Role deletion never removes users.
"""

from __future__ import annotations

from supabase import Client

from app.audit.service import record_audit
from app.core.exceptions import ConflictError, NotFoundError, UnprocessableError
from app.core.permissions import SUPER_ADMIN_ROLE
from app.roles import crud
from app.roles.schemas import RoleCreate, RoleOut, RolePermissionsUpdate, RoleUpdate, RoleWithPermissions


def list_roles(db: Client, *, include_inactive: bool = False) -> list[RoleOut]:
    roles = crud.list_roles(db, active_only=not include_inactive)
    return [RoleOut.model_validate(r) for r in roles]


def get_role(db: Client, role_id: str) -> RoleWithPermissions:
    role = crud.get_role(db, role_id)
    if role is None:
        raise NotFoundError("Role not found", code="role_not_found")
    permissions = crud.get_role_permission_names(db, role_id)
    return RoleWithPermissions(**role, permissions=permissions)


def _normalize_name(name: str) -> str:
    return name.strip().lower()


def create_role(db: Client, data: RoleCreate, actor: dict | None = None) -> RoleOut:
    payload = data.model_dump()
    payload["name"] = _normalize_name(payload["name"])
    payload["is_system_role"] = False  # API-created roles are always custom.
    role = crud.create_role(db, payload)
    record_audit(
        db,
        user_id=actor["id"] if actor else None,
        action="role.create",
        module="roles",
        entity_type="role",
        entity_id=role["id"],
        description=f"Created role {role['name']}",
        new_values={"name": role["name"]},
    )
    return RoleOut.model_validate(role)


def update_role(db: Client, role_id: str, data: RoleUpdate, actor: dict | None = None) -> RoleOut:
    role = crud.get_role(db, role_id)
    if role is None:
        raise NotFoundError("Role not found", code="role_not_found")

    payload = data.model_dump(exclude_unset=True)
    if not payload:
        return RoleOut.model_validate(role)

    is_system = role["is_system_role"] or role["name"] == SUPER_ADMIN_ROLE

    if "name" in payload:
        # System role names are part of their identity (the seeder upserts by
        # name and is_super_admin resolution is name-based) so they are fixed.
        if is_system:
            raise ConflictError("System roles cannot be renamed", code="system_role_locked")
        new_name = _normalize_name(payload["name"])
        payload["name"] = new_name
        existing = crud.get_role_by_name(db, new_name)
        if existing is not None and existing["id"] != role_id:
            raise ConflictError("A role with this name already exists", code="role_name_exists")

    if "is_active" in payload and payload["is_active"] is False:
        if is_system:
            raise ConflictError("System roles cannot be deactivated", code="system_role_locked")

    updated = crud.update_role(db, role_id, payload)
    _audit_role_changes(db, role, payload, actor)
    return RoleOut.model_validate(updated)


def _audit_role_changes(db: Client, role: dict, payload: dict, actor: dict | None) -> None:
    actor_id = actor["id"] if actor else None
    if "name" in payload:
        record_audit(
            db, user_id=actor_id, action="role.rename", module="roles",
            entity_type="role", entity_id=role["id"],
            description=f"Renamed role {role['name']} → {payload['name']}",
            old_values={"name": role["name"]}, new_values={"name": payload["name"]},
        )
    if "is_active" in payload:
        state = "deactivated" if payload["is_active"] is False else "activated"
        record_audit(
            db, user_id=actor_id, action="role.status", module="roles",
            entity_type="role", entity_id=role["id"],
            description=f"{state.capitalize()} role {role['name']}",
            old_values={"is_active": role["is_active"]}, new_values={"is_active": payload["is_active"]},
        )
    if "description" in payload:
        record_audit(
            db, user_id=actor_id, action="role.update", module="roles",
            entity_type="role", entity_id=role["id"],
            description=f"Updated role {role['name']}",
            old_values={"description": role.get("description")}, new_values={"description": payload["description"]},
        )


def delete_role(db: Client, role_id: str, actor: dict | None = None) -> None:
    role = crud.get_role(db, role_id)
    if role is None:
        raise NotFoundError("Role not found", code="role_not_found")
    if role["is_system_role"] or role["name"] == SUPER_ADMIN_ROLE:
        raise ConflictError("System roles cannot be deleted", code="system_role_locked")

    in_use = crud.count_users_for_role(db, role_id)
    if in_use > 0:
        raise ConflictError(
            f"Cannot delete role assigned to {in_use} user(s). Deactivate it instead.",
            code="role_in_use",
        )

    crud.delete_role(db, role_id)
    record_audit(
        db,
        user_id=actor["id"] if actor else None,
        action="role.delete",
        module="roles",
        entity_type="role",
        entity_id=role_id,
        description=f"Deleted role {role['name']}",
        old_values={"name": role["name"], "is_active": role["is_active"]},
    )


def set_role_permissions(db: Client, role_id: str, data: RolePermissionsUpdate, actor: dict | None = None) -> RoleWithPermissions:
    role = crud.get_role(db, role_id)
    if role is None:
        raise NotFoundError("Role not found", code="role_not_found")
    if role["name"] == SUPER_ADMIN_ROLE:
        raise ConflictError("super_admin always has all permissions", code="super_admin_locked")

    # Deduplicate and validate before touching the database.
    ids = {str(pid) for pid in data.permission_ids}
    existing = crud.get_existing_permission_ids(db, list(ids))
    if len(existing) != len(ids):
        raise UnprocessableError("One or more permission IDs do not exist", code="invalid_permission_id")

    old = crud.get_role_permission_names(db, role_id)
    crud.set_role_permissions(db, role_id, list(existing))
    permissions = crud.get_role_permission_names(db, role_id)
    record_audit(
        db,
        user_id=actor["id"] if actor else None,
        action="role.permissions",
        module="roles",
        entity_type="role",
        entity_id=role_id,
        description=f"Updated permissions for role {role['name']}",
        old_values={"permissions": old},
        new_values={"permissions": permissions},
    )
    return RoleWithPermissions(**role, permissions=permissions)
