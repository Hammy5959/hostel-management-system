"""Idempotent seeder for system roles, the permission catalog, and role→permission grants.

Run from the backend/ directory (after grants have been applied):

    uv run python -m app.seed.run

Safe to run repeatedly: existing rows are never duplicated.
"""

from __future__ import annotations

from supabase import Client

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.passwords import hash_password
from app.core.permissions import SUPER_ADMIN_ROLE
from app.seed.catalog import PERMISSIONS, ROLES, ROLE_PERMISSIONS
from app.users.crud import get_user_by_email

logger = get_logger(__name__)


def _upsert_roles(db: Client) -> dict[str, str]:
    existing = db.table("roles").select("id, name").execute()
    by_name = {r["name"]: r["id"] for r in existing.data}
    for role in ROLES:
        if role["name"] not in by_name:
            res = db.table("roles").insert(role).execute()
            by_name[role["name"]] = res.data[0]["id"]
            logger.info("Inserted role %s", role["name"])
    return by_name


def _upsert_permissions(db: Client) -> dict[str, str]:
    existing = db.table("permissions").select("id, name").execute()
    by_name = {p["name"]: p["id"] for p in existing.data}
    for perm in PERMISSIONS:
        if perm["name"] not in by_name:
            res = db.table("permissions").insert(perm).execute()
            by_name[perm["name"]] = res.data[0]["id"]
            logger.info("Inserted permission %s", perm["name"])
    return by_name


def _grant(db: Client, role_id: str, permission_ids: list[str]) -> int:
    if not permission_ids:
        return 0
    existing = db.table("role_permissions").select("permission_id").eq("role_id", role_id).execute()
    have = {r["permission_id"] for r in existing.data}
    missing = [pid for pid in permission_ids if pid not in have]
    if missing:
        rows = [{"role_id": role_id, "permission_id": pid} for pid in missing]
        db.table("role_permissions").insert(rows).execute()
    return len(missing)


def ensure_super_admin(db: Client, role_ids: dict[str, str]) -> dict:
    """Create (or promote) the initial super_admin user.

    The account starts as ``invited`` and is activated on its first OTP login.
    Its password is stored ONLY as an Argon2id hash (``password_hash``) — the
    plaintext is never persisted. Idempotent: running the seeder repeatedly
    never duplicates the user and never resets an already-set password.
    """
    settings = get_settings()
    email = settings.super_admin_email.strip().lower()
    super_role_id = role_ids[SUPER_ADMIN_ROLE]
    password_hash = hash_password(settings.super_admin_password)

    existing = get_user_by_email(db, email)
    if existing is not None:
        promoted = False
        if existing.get("role_id") != super_role_id:
            db.table("users").update({"role_id": super_role_id}).eq("id", existing["id"]).execute()
            logger.info("Promoted existing user %s to super_admin", email)
            promoted = True
        # Set the initial password only when the account has none yet.
        if not existing.get("password_hash"):
            db.table("users").update({"password_hash": password_hash}).eq("id", existing["id"]).execute()
            logger.info("Set initial password for super_admin user %s", email)
        if promoted:
            return {"created": False, "promoted": True}
        logger.info("super_admin user already present: %s", email)
        return {"created": False, "promoted": False, "password_set": bool(existing.get("password_hash"))}

    db.table("users").insert({
        "email": email,
        "role_id": super_role_id,
        "first_name": settings.super_admin_first_name,
        "last_name": settings.super_admin_last_name,
        "status": "invited",
        "email_verified": False,
        "password_hash": password_hash,
    }).execute()
    logger.info("Created initial super_admin user %s (status=invited, password hashed)", email)
    return {"created": True, "promoted": False}


def run_seed(db: Client) -> dict:
    role_ids = _upsert_roles(db)
    perm_ids = _upsert_permissions(db)

    counts: dict[str, int] = {}

    # super_admin receives every permission automatically.
    super_id = role_ids[SUPER_ADMIN_ROLE]
    counts[SUPER_ADMIN_ROLE] = _grant(db, super_id, list(perm_ids.values()))

    for role_name, permission_names in ROLE_PERMISSIONS.items():
        pids = [perm_ids[n] for n in permission_names if n in perm_ids]
        counts[role_name] = _grant(db, role_ids[role_name], pids)

    admin = ensure_super_admin(db, role_ids)
    counts["super_admin_bootstrap"] = admin

    return counts


if __name__ == "__main__":
    from app.core.logging import setup_logging
    from app.database.supabase import get_supabase

    setup_logging()
    counts = run_seed(get_supabase())
    grants = {k: v for k, v in counts.items() if k != "super_admin_bootstrap"}
    total = sum(v for v in grants.values() if isinstance(v, int))
    admin = counts.get("super_admin_bootstrap", {})
    print(f"Seed complete. New role_permission grants per role: {grants}")
    print(f"Total new grants: {total} (0 on re-runs = idempotent).")
    print(f"Initial super_admin user: {get_settings().super_admin_email} (created={admin.get('created')}, promoted={admin.get('promoted')})")
