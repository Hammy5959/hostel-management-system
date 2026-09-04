"""Thin shared helpers over the PostgREST client.

These encode the repeated "execute + translate errors" pattern so per-entity
modules stay small and consistent. They are deliberately NOT a full generic
CRUD framework — each module still owns its business rules.
"""

from __future__ import annotations

from typing import Iterable

from supabase import Client

from app.database.supabase import raise_for_error


def get_by_id(db: Client, table: str, record_id: str) -> dict | None:
    res = db.table(table).select("*").eq("id", record_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, f"get {table}")
    return res.data[0] if res.data else None


def insert(db: Client, table: str, data: dict) -> dict:
    res = db.table(table).insert(data).execute()
    if getattr(res, "error", None):
        raise_for_error(res, f"create {table}")
    return res.data[0]


def update(db: Client, table: str, record_id: str, data: dict) -> dict:
    res = db.table(table).update(data).eq("id", record_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, f"update {table}")
    return res.data[0]


def upsert(db: Client, table: str, data: dict | list[dict], *, on_conflict: str) -> list[dict]:
    """Insert, or update on conflict, one row or a batch of rows in one call.

    `on_conflict` is a comma-separated column list matching an existing UNIQUE
    constraint (e.g. "resident_id,meal_date,meal_type"). Returns the full row
    list so callers doing a single-row upsert take `[0]`.
    """
    res = db.table(table).upsert(data, on_conflict=on_conflict).execute()
    if getattr(res, "error", None):
        raise_for_error(res, f"upsert {table}")
    return res.data


def delete(db: Client, table: str, record_id: str) -> None:
    res = db.table(table).delete().eq("id", record_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, f"delete {table}")


def list_page(
    db: Client,
    table: str,
    *,
    page: int,
    per_page: int,
    select: str = "*",
    eq: dict | None = None,
    gte: dict | None = None,
    lte: dict | None = None,
    in_: dict | None = None,
    not_in: dict | None = None,
    search_columns: Iterable[str] = (),
    search_groups: Iterable[str] = (),
    search: str | None = None,
    order: str = "created_at",
    desc: bool = True,
) -> tuple[list[dict], int]:
    """Paginate a table with optional filters, ILIKE search and date ranges.

    Filtering happens in the database (PostgREST), never in Python. `search_groups`
    lets a caller OR in extra raw PostgREST filter fragments (e.g. an `and(...)`
    group matching two columns at once) alongside the per-column ILIKE matches
    built from `search_columns`.
    """
    query = db.table(table).select(select, count="exact")
    for col, val in (eq or {}).items():
        if val is not None:
            query = query.eq(col, val)
    for col, val in (gte or {}).items():
        if val is not None:
            query = query.gte(col, val)
    for col, val in (lte or {}).items():
        if val is not None:
            query = query.lte(col, val)
    for col, val in (in_ or {}).items():
        if val:
            query = query.in_(col, val)
    for col, val in (not_in or {}).items():
        if val:
            query = query.not_.in_(col, val)
    search = search.strip() if search else search
    if search and (search_columns or search_groups):
        parts = [f"{c}.ilike.*{search}*" for c in search_columns]
        parts.extend(search_groups)
        query = query.or_(",".join(parts))
    query = query.order(order, desc=desc).range((page - 1) * per_page, page * per_page - 1)
    res = query.execute()
    if getattr(res, "error", None):
        raise_for_error(res, f"list {table}")
    return res.data, int(res.count or 0)
