"""Visitor business logic."""

from __future__ import annotations

from supabase import Client

from app.common.authz import has_permission
from app.core.exceptions import ForbiddenError, NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.residents.service import get_resident_by_user
from app.visitors.schemas import VisitorCreate, VisitorList, VisitorOut, VisitorUpdate

_TABLE = "visitors"


def create_visitor(db: Client, user: dict, data: VisitorCreate) -> VisitorOut:
    if get_by_id(db, "residents", str(data.resident_id)) is None:
        raise NotFoundError("Resident not found", code="resident_not_found")
    payload = data.model_dump(mode="json")
    payload["status"] = "expected"
    payload["created_by"] = user["id"]
    return VisitorOut.model_validate(insert(db, _TABLE, payload))


def update_visitor(db: Client, visitor_id: str, data: VisitorUpdate) -> VisitorOut:
    if get_by_id(db, _TABLE, visitor_id) is None:
        raise NotFoundError("Visitor not found", code="visitor_not_found")
    return VisitorOut.model_validate(update(db, _TABLE, visitor_id, data.model_dump(exclude_unset=True)))


def list_visitors(
    db: Client,
    user: dict,
    *,
    page: int,
    per_page: int,
    resident_id: str | None,
    status: str | None,
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
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        eq=eq or None, order="created_at", desc=True,
    )
    return VisitorList(items=[VisitorOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)
