"""Shared authorization helpers for service-layer ownership decisions.

Routes declare coarse permissions via require_permission(); services that must
distinguish "full manage" from "own record" (e.g. resident documents) use these
helpers. Super Admin is treated as having every permission.
"""

from __future__ import annotations

from supabase import Client

from app.core.permissions import SUPER_ADMIN_ROLE, get_role_name, get_user_permissions

_WILDCARD = "*"


def get_permissions(db: Client, user: dict) -> set[str]:
    """Permission set for a user; super_admin is represented by the wildcard."""
    if get_role_name(db, user.get("role_id")) == SUPER_ADMIN_ROLE:
        return {_WILDCARD}
    return get_user_permissions(db, user)


def has_permission(db: Client, user: dict, permission: str) -> bool:
    perms = get_permissions(db, user)
    return _WILDCARD in perms or permission in perms
