"""Permission-based authorization dependencies.

The whole application authorizes via permissions, never by hard-coded role
comparisons. ``super_admin`` automatically has every permission.

    user -> role -> role_permissions -> permissions -> API access
"""

from __future__ import annotations

from fastapi import Depends
from supabase import Client

from app.api.deps import get_db
from app.core.dependencies import get_current_user
from app.core.exceptions import ForbiddenError
from app.database.supabase import raise_for_error

SUPER_ADMIN_ROLE = "super_admin"


def get_role_name(db: Client, role_id: str | None) -> str | None:
    if not role_id:
        return None
    res = db.table("roles").select("name").eq("id", role_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "load role")
    return res.data[0]["name"] if res.data else None


def is_super_admin(db: Client, user: dict) -> bool:
    return get_role_name(db, user.get("role_id")) == SUPER_ADMIN_ROLE


def get_user_permissions(db: Client, user: dict) -> set[str]:
    """Resolve the set of permission names granted to a user's role.

    A **deactivated role grants nothing**: deactivating a role is a safe,
    reversible "off switch" for everyone holding it (they keep their account
    and can be reactivated; they simply lose API access while it is off).
    """
    role_id = user.get("role_id")
    if not role_id:
        return set()
    role_res = db.table("roles").select("is_active").eq("id", role_id).execute()
    if getattr(role_res, "error", None):
        raise_for_error(role_res, "load role activity")
    if not role_res.data or role_res.data[0].get("is_active") is False:
        return set()
    res = (
        db.table("role_permissions")
        .select("permissions(name)")
        .eq("role_id", role_id)
        .execute()
    )
    if getattr(res, "error", None):
        raise_for_error(res, "load permissions")
    names: set[str] = set()
    for row in res.data:
        permission = row.get("permissions")
        if permission and permission.get("name"):
            names.add(permission["name"])
    return names


def _authorize(
    user: dict,
    db: Client,
    required: tuple[str, ...],
    *,
    require_all: bool,
) -> dict:
    if is_super_admin(db, user):
        return user
    permissions = get_user_permissions(db, user)
    if require_all:
        ok = set(required).issubset(permissions)
    else:
        ok = bool(required and (set(required) & permissions))
    if not ok:
        raise ForbiddenError(
            "You are not authorized to perform this action",
            code="missing_permission",
        )
    return user


def require_permission(*required: str):
    """FastAPI dependency requiring ALL of the given permissions.

    Super Admin bypasses the check entirely. Returns the authenticated user.
    """

    def dependency(
        user: dict = Depends(get_current_user),
        db: Client = Depends(get_db),
    ) -> dict:
        return _authorize(user, db, required, require_all=True)

    return dependency


def require_any_permission(*required: str):
    """FastAPI dependency requiring AT LEAST ONE of the given permissions."""

    def dependency(
        user: dict = Depends(get_current_user),
        db: Client = Depends(get_db),
    ) -> dict:
        return _authorize(user, db, required, require_all=False)

    return dependency
