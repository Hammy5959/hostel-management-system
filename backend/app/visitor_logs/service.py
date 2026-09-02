"""Visitor check-in/check-out business logic.

Check-in creates a log and marks the visitor checked_in; check-out closes the
open log and marks the visitor checked_out. History is preserved.
"""

from __future__ import annotations

from datetime import datetime, timezone

from supabase import Client

from app.core.exceptions import ConflictError, NotFoundError
from app.database.crud import get_by_id, list_page
from app.database.supabase import raise_for_error
from app.visitor_logs.schemas import VisitorLogCheckIn, VisitorLogCheckOut, VisitorLogList, VisitorLogOut

_TABLE = "visitor_logs"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resolve_visitor_ids_by_search(db: Client, search: str) -> list[str]:
    """Resolve a visitor-name/phone/resident-name search term to matching
    visitor ids. A log row only carries visitor_id, so a search spanning
    visitor.* and resident.* has to be resolved here first, then applied as
    a plain in-list filter on visitor_logs itself — mirrors
    app.allocations.service._resolve_search_scope."""
    needle = search.lower()
    resident_res = db.table("residents").select("id, first_name, last_name").execute()
    if getattr(resident_res, "error", None):
        raise_for_error(resident_res, "search residents")
    resident_ids = {
        r["id"] for r in (resident_res.data or [])
        if needle in f"{r['first_name']} {r.get('last_name') or ''}".strip().lower()
    }

    visitors_res = db.table("visitors").select("id, visitor_name, visitor_phone, resident_id").execute()
    if getattr(visitors_res, "error", None):
        raise_for_error(visitors_res, "search visitors")
    return [
        v["id"] for v in (visitors_res.data or [])
        if needle in (v.get("visitor_name") or "").lower()
        or needle in (v.get("visitor_phone") or "").lower()
        or v.get("resident_id") in resident_ids
    ]


def check_in(db: Client, user: dict, data: VisitorLogCheckIn) -> VisitorLogOut:
    visitor = get_by_id(db, "visitors", str(data.visitor_id))
    if visitor is None:
        raise NotFoundError("Visitor not found", code="visitor_not_found")
    if visitor.get("is_blacklisted"):
        raise ConflictError("This visitor is blacklisted and cannot be checked in", code="visitor_blacklisted")
    if visitor["status"] == "checked_in":
        raise ConflictError("Visitor is already checked in", code="already_checked_in")

    res = db.table(_TABLE).insert({
        "visitor_id": str(data.visitor_id),
        "check_in_at": _now_iso(),
        "checked_in_by": user["id"],
        "remarks": data.remarks,
    }).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "create visitor log")

    db.table("visitors").update({"status": "checked_in", "updated_at": _now_iso()}).eq("id", str(data.visitor_id)).execute()
    return VisitorLogOut.model_validate(res.data[0])


def check_out(db: Client, user: dict, log_id: str, data: VisitorLogCheckOut) -> VisitorLogOut:
    log = get_by_id(db, _TABLE, log_id)
    if log is None:
        raise NotFoundError("Visitor log not found", code="visitor_log_not_found")
    if log["check_out_at"] is not None:
        raise ConflictError("Visitor is already checked out", code="already_checked_out")

    res = db.table(_TABLE).update({
        "check_out_at": _now_iso(),
        "checked_out_by": user["id"],
        "remarks": data.remarks if data.remarks is not None else log.get("remarks"),
    }).eq("id", log_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "update visitor log")

    db.table("visitors").update({"status": "checked_out", "updated_at": _now_iso()}).eq("id", log["visitor_id"]).execute()
    return VisitorLogOut.model_validate(res.data[0])


def list_logs(
    db: Client,
    *,
    page: int,
    per_page: int,
    visitor_id: str | None,
    date_from: str | None,
    date_to: str | None,
    search: str | None = None,
) -> VisitorLogList:
    eq = {"visitor_id": visitor_id} if visitor_id else None
    in_ = None
    if search and search.strip():
        matched_ids = _resolve_visitor_ids_by_search(db, search.strip())
        if not matched_ids:
            return VisitorLogList(items=[], total=0, page=page, per_page=per_page)
        in_ = {"visitor_id": matched_ids}
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        eq=eq, in_=in_,
        gte={"check_in_at": date_from} if date_from else None,
        lte={"check_in_at": date_to} if date_to else None,
        order="check_in_at", desc=True,
    )
    return VisitorLogList(items=[VisitorLogOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)
