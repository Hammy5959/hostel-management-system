"""Database access for the permission catalog."""

from __future__ import annotations

from supabase import Client

from app.database.supabase import raise_for_error


def list_permissions(db: Client, *, module: str | None = None) -> list[dict]:
    query = db.table("permissions").select("*").order("module").order("name")
    if module:
        query = query.eq("module", module)
    res = query.execute()
    if getattr(res, "error", None):
        raise_for_error(res, "list permissions")
    return res.data
