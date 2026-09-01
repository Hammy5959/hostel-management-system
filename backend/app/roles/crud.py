"""Database access for roles and role_permissions."""

from __future__ import annotations

from supabase import Client

from app.core.exceptions import ConflictError
from app.database.supabase import raise_for_error

# Deleting a role cascades to role_permissions (ON DELETE CASCADE); users who
# hold the role are protected by users.role_id FK (NO ACTION) at the database
# level, and by the service-level `role_in_use` guard before that.


def list_roles(db: Client, *, active_only: bool = False) -> list[dict]:
    query = db.table("roles").select("*").order("name")
    if active_only:
        query = query.eq("is_active", True)
    res = query.execute()
    if getattr(res, "error", None):
        raise_for_error(res, "list roles")
    return res.data


def get_role(db: Client, role_id: str) -> dict | None:
    res = db.table("roles").select("*").eq("id", role_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "get role")
    return res.data[0] if res.data else None


def get_role_by_name(db: Client, name: str) -> dict | None:
    res = db.table("roles").select("*").eq("name", name).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "get role by name")
    return res.data[0] if res.data else None


def create_role(db: Client, data: dict) -> dict:
    if get_role_by_name(db, data["name"]):
        raise ConflictError("A role with this name already exists", code="role_name_exists")
    res = db.table("roles").insert(data).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "create role")
    return res.data[0]


def update_role(db: Client, role_id: str, data: dict) -> dict:
    res = db.table("roles").update(data).eq("id", role_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "update role")
    return res.data[0]


def delete_role(db: Client, role_id: str) -> None:
    """Hard-delete a role. Only safe for custom roles with no assigned users —
    role_permissions cascade; users.role_id (NO ACTION) blocks in-use roles."""
    res = db.table("roles").delete().eq("id", role_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "delete role")


def count_users_for_role(db: Client, role_id: str) -> int:
    res = db.table("users").select("id", count="exact").eq("role_id", role_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "count users for role")
    return int(res.count or 0)


def get_existing_permission_ids(db: Client, permission_ids: list[str]) -> set[str]:
    """Return the subset of permission_ids that actually exist."""
    if not permission_ids:
        return set()
    res = db.table("permissions").select("id").in_("id", permission_ids).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "validate permission ids")
    return {row["id"] for row in res.data}


def get_role_permission_names(db: Client, role_id: str) -> list[str]:
    res = (
        db.table("role_permissions")
        .select("permissions(name)")
        .eq("role_id", role_id)
        .execute()
    )
    if getattr(res, "error", None):
        raise_for_error(res, "get role permissions")
    names = []
    for row in res.data:
        perm = row.get("permissions")
        if perm and perm.get("name"):
            names.append(perm["name"])
    return sorted(names)


def set_role_permissions(db: Client, role_id: str, permission_ids: list[str]) -> None:
    """Replace a role's permission grants."""
    db.table("role_permissions").delete().eq("role_id", role_id).execute()
    if permission_ids:
        rows = [{"role_id": role_id, "permission_id": pid} for pid in permission_ids]
        res = db.table("role_permissions").insert(rows).execute()
        if getattr(res, "error", None):
            raise_for_error(res, "set role permissions")
