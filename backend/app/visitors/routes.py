"""Visitor endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_any_permission, require_permission
from app.visitors import service
from app.visitors.schemas import VisitorCreate, VisitorList, VisitorOut, VisitorUpdate

router = APIRouter(prefix="/visitors", tags=["visitors"])


@router.get("", response_model=VisitorList, summary="List visitors")
def list_visitors(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    resident_id: str | None = None,
    status: str | None = None,
    user: dict = Depends(require_any_permission("visitors.view", "visitors.view_own")),
    db: Client = Depends(get_db),
) -> VisitorList:
    return service.list_visitors(db, user, page=page, per_page=per_page, resident_id=resident_id, status=status)


@router.post("", response_model=VisitorOut, status_code=201, summary="Register a visitor")
def create_visitor(
    payload: VisitorCreate,
    user: dict = Depends(require_permission("visitors.create")),
    db: Client = Depends(get_db),
) -> VisitorOut:
    return service.create_visitor(db, user, payload)


@router.patch("/{visitor_id}", response_model=VisitorOut, summary="Update a visitor record")
def update_visitor(
    visitor_id: str,
    payload: VisitorUpdate,
    _: dict = Depends(require_permission("visitors.create")),
    db: Client = Depends(get_db),
) -> VisitorOut:
    return service.update_visitor(db, visitor_id, payload)
