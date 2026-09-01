"""Low-level database access for the public.users table."""

from __future__ import annotations

from datetime import datetime, timezone

from supabase import Client

from app.database.supabase import raise_for_error

# Statuses a user must be in to authenticate. `invited` is allowed so a
# freshly-created account can complete its first (activation) login.
# `deleted` is the soft-delete/archive state set by DELETE /users/{id} — such
# accounts are permanently excluded from authentication.
AUTHENTICABLE_STATUSES = ("active", "invited")
BLOCKED_STATUSES = ("inactive", "suspended", "deleted")


def get_user_by_email(db: Client, email: str) -> dict | None:
    res = db.table("users").select("*").eq("email", email).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "look up user by email")
    return res.data[0] if res.data else None


def get_user_by_id(db: Client, user_id: str) -> dict | None:
    res = db.table("users").select("*").eq("id", user_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "look up user by id")
    return res.data[0] if res.data else None


def create_user(db: Client, data: dict) -> dict:
    res = db.table("users").insert(data).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "create user")
    return res.data[0]


def update_user(db: Client, user_id: str, data: dict) -> dict:
    res = db.table("users").update(data).eq("id", user_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "update user")
    return res.data[0]


def list_users(
    db: Client,
    *,
    page: int = 1,
    per_page: int = 20,
    search: str | None = None,
    role_id: str | None = None,
    status: str | None = None,
) -> tuple[list[dict], int]:
    query = db.table("users").select("*", count="exact")
    if search:
        query = query.or_(
            f"email.ilike.*{search}*,first_name.ilike.*{search}*,last_name.ilike.*{search}*"
        )
    if role_id:
        query = query.eq("role_id", role_id)
    if status:
        query = query.eq("status", status)
    query = query.order("created_at", desc=True).range((page - 1) * per_page, page * per_page - 1)
    res = query.execute()
    if getattr(res, "error", None):
        raise_for_error(res, "list users")
    return res.data, int(res.count or 0)


def mark_user_authenticated(db: Client, user_id: str) -> dict:
    """Mark a user as active after successful OTP verification."""
    now_iso = datetime.now(timezone.utc).isoformat()
    res = (
        db.table("users")
        .update({"status": "active", "email_verified": True, "last_login_at": now_iso})
        .eq("id", user_id)
        .execute()
    )
    if getattr(res, "error", None):
        raise_for_error(res, "update user")
    return res.data[0]
