"""Database access for staff records."""

from __future__ import annotations

from supabase import Client

from app.database.supabase import raise_for_error

_SELECT = "*, users(first_name, last_name, email, phone, role_id, status)"


def list_staff(
    db: Client,
    *,
    page: int = 1,
    per_page: int = 20,
    search: str | None = None,
    department: str | None = None,
) -> tuple[list[dict], int]:
    query = db.table("staff").select(_SELECT, count="exact")
    if search:
        query = query.or_(f"employee_number.ilike.*{search}*,designation.ilike.*{search}*")
    if department:
        query = query.eq("department", department)
    query = query.order("created_at", desc=True).range((page - 1) * per_page, page * per_page - 1)
    res = query.execute()
    if getattr(res, "error", None):
        raise_for_error(res, "list staff")
    return res.data, int(res.count or 0)


def get_staff(db: Client, staff_id: str) -> dict | None:
    res = db.table("staff").select(_SELECT).eq("id", staff_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "get staff")
    return res.data[0] if res.data else None


def get_staff_by_user(db: Client, user_id: str) -> dict | None:
    res = db.table("staff").select(_SELECT).eq("user_id", user_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "get staff by user")
    return res.data[0] if res.data else None


def create_staff(db: Client, data: dict) -> dict:
    res = db.table("staff").insert(data).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "create staff")
    return res.data[0]


def update_staff(db: Client, staff_id: str, data: dict) -> dict:
    res = db.table("staff").update(data).eq("id", staff_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "update staff")
    return res.data[0]
