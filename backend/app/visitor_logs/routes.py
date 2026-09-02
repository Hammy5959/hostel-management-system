"""Visitor log endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.visitor_logs import service
from app.visitor_logs.schemas import VisitorLogCheckIn, VisitorLogCheckOut, VisitorLogList, VisitorLogOut

router = APIRouter(prefix="/visitor-logs", tags=["visitor-logs"])


@router.get("", response_model=VisitorLogList, summary="List visitor logs")
def list_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    visitor_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    search: str | None = None,
    _: dict = Depends(require_permission("visitor_logs.view")),
    db: Client = Depends(get_db),
) -> VisitorLogList:
    return service.list_logs(
        db, page=page, per_page=per_page, visitor_id=visitor_id, date_from=date_from, date_to=date_to, search=search,
    )


@router.post("/check-in", response_model=VisitorLogOut, status_code=201, summary="Check a visitor in")
def check_in(
    payload: VisitorLogCheckIn,
    user: dict = Depends(require_permission("visitor_logs.create")),
    db: Client = Depends(get_db),
) -> VisitorLogOut:
    return service.check_in(db, user, payload)


@router.post("/{log_id}/check-out", response_model=VisitorLogOut, summary="Check a visitor out")
def check_out(
    log_id: str,
    payload: VisitorLogCheckOut,
    user: dict = Depends(require_permission("visitor_logs.create")),
    db: Client = Depends(get_db),
) -> VisitorLogOut:
    return service.check_out(db, user, log_id, payload)
