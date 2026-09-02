"""Visitor business logic."""

from __future__ import annotations

from supabase import Client

from app.common.authz import has_permission
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.database.supabase import raise_for_error
from app.residents.service import get_resident_by_user
from app.visitors.schemas import VisitorCreate, VisitorList, VisitorOut, VisitorUpdate

_TABLE = "visitors"


def _resolve_resident_ids_by_name(db: Client, search: str) -> list[str]:
    """Resolve a resident-name search term to resident ids — mirrors
    app.allocations.service._resolve_search_scope's resident name matching
    (full "first last" name, case-insensitive/partial), since a visitor row
    only carries resident_id, not the resident's name."""
    needle = search.lower()
    res = db.table("residents").select("id, first_name, last_name").execute()
    if getattr(res, "error", None):
        raise_for_error(res, "search residents")
    return [
        r["id"] for r in (res.data or [])
        if needle in f"{r['first_name']} {r.get('last_name') or ''}".strip().lower()
    ]


def create_visitor(db: Client, user: dict, data: VisitorCreate) -> VisitorOut:
    resident = get_by_id(db, "residents", str(data.resident_id))
    if resident is None:
        raise NotFoundError("Resident not found", code="resident_not_found")
    # Residents add guests for themselves; staff with view may add for any resident.
    if not has_permission(db, user, "visitors.view"):
        own = get_resident_by_user(db, user["id"])
        if own is None or str(own["id"]) != str(data.resident_id):
            raise ForbiddenError("You can only add guests for yourself", code="not_your_resident")
    # Only checked_out is blocked — on_leave is temporary (bed still
    # allocated, resident will return), so it must stay allowed.
    if resident["status"] == "checked_out":
        raise ConflictError(
            "Cannot add a visitor for a resident who has checked out", code="resident_not_active",
        )
    payload = data.model_dump(mode="json")
    payload["status"] = "expected"
    payload["created_by"] = user["id"]
    return VisitorOut.model_validate(insert(db, _TABLE, payload))


def update_visitor(db: Client, visitor_id: str, data: VisitorUpdate) -> VisitorOut:
    if get_by_id(db, _TABLE, visitor_id) is None:
        raise NotFoundError("Visitor not found", code="visitor_not_found")
    return VisitorOut.model_validate(update(db, _TABLE, visitor_id, data.model_dump(exclude_unset=True)))


def cancel_visitor(db: Client, visitor_id: str) -> VisitorOut:
    visitor = get_by_id(db, _TABLE, visitor_id)
    if visitor is None:
        raise NotFoundError("Visitor not found", code="visitor_not_found")
    if visitor["status"] != "expected":
        raise ConflictError(
            f"Only an expected visitor can be cancelled; this visitor has already been "
            f"{visitor['status'].replace('_', ' ')}",
            code="cannot_cancel",
        )
    return VisitorOut.model_validate(update(db, _TABLE, visitor_id, {"status": "cancelled"}))


def list_visitors(
    db: Client,
    user: dict,
    *,
    page: int,
    per_page: int,
    resident_id: str | None,
    status: str | None,
    search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> VisitorList:
    if has_permission(db, user, "visitors.view"):
        scope = str(resident_id) if resident_id else None
    elif has_permission(db, user, "visitors.view_own"):
        own = get_resident_by_user(db, user["id"])
        if own is None:
            raise ForbiddenError("No resident profile linked to this account", code="resident_not_linked")
        scope = str(own["id"])
    else:
        raise ForbiddenError("You cannot view visitors", code="missing_permission")

    eq = {"resident_id": scope} if scope else {}
    if status:
        eq["status"] = status

    # A search spans visitor_name/visitor_phone (plain columns, handled by
    # list_page's search_columns) and the resident's name (not a column on
    # this table, so resolved to resident_id first — mirrors
    # app.allocations.service._resolve_search_scope).
    search_groups: list[str] = []
    if search and search.strip():
        resident_ids = _resolve_resident_ids_by_name(db, search.strip())
        if resident_ids:
            search_groups.append(f"resident_id.in.({','.join(resident_ids)})")

    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        eq=eq or None, search=search, search_columns=("visitor_name", "visitor_phone"),
        search_groups=search_groups,
        gte={"expected_at": date_from} if date_from else None,
        lte={"expected_at": date_to} if date_to else None,
        order="created_at", desc=True,
    )
    return VisitorList(items=[VisitorOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)
