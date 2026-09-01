"""Complaint endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.complaints import service
from app.complaints.schemas import ComplaintCreate, ComplaintList, ComplaintOut, ComplaintUpdate
from app.core.permissions import require_any_permission, require_permission

router = APIRouter(prefix="/complaints", tags=["complaints"])


@router.get("", response_model=ComplaintList, summary="List complaints")
def list_complaints(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    resident_id: str | None = None,
    status: str | None = None,
    room_id: str | None = None,
    user: dict = Depends(require_any_permission("complaints.view", "complaints.view_own")),
    db: Client = Depends(get_db),
) -> ComplaintList:
    return service.list_complaints(db, user, page=page, per_page=per_page, resident_id=resident_id, status=status, room_id=room_id)


@router.post("", response_model=ComplaintOut, status_code=201, summary="File a complaint")
def create(
    payload: ComplaintCreate,
    user: dict = Depends(require_permission("complaints.create")),
    db: Client = Depends(get_db),
) -> ComplaintOut:
    return service.create(db, user, payload)


@router.patch("/{complaint_id}", response_model=ComplaintOut, summary="Update a complaint (status, details)")
def update_complaint(
    complaint_id: str,
    payload: ComplaintUpdate,
    _: dict = Depends(require_permission("complaints.update")),
    db: Client = Depends(get_db),
) -> ComplaintOut:
    return service.update_complaint(db, complaint_id, payload)
