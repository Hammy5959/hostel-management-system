"""Leave request endpoints."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_any_permission, require_permission
from app.leaves import service
from app.leaves.schemas import LeaveCreate, LeaveList, LeaveOut, LeaveReview

router = APIRouter(prefix="/leave-requests", tags=["leave-requests"])


@router.get("", response_model=LeaveList, summary="List leave requests")
def list_leaves(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    resident_id: str | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    user: dict = Depends(require_any_permission("leave_requests.view", "leave_requests.view_own")),
    db: Client = Depends(get_db),
) -> LeaveList:
    return service.list_leaves(db, user, page=page, per_page=per_page, resident_id=resident_id, status=status, date_from=date_from, date_to=date_to)


@router.post("", response_model=LeaveOut, status_code=201, summary="Create a leave request")
def create(
    payload: LeaveCreate,
    user: dict = Depends(require_permission("leave_requests.create")),
    db: Client = Depends(get_db),
) -> LeaveOut:
    return service.create(db, user, payload)


@router.post("/{leave_id}/approve", response_model=LeaveOut, summary="Approve a leave request")
def approve(
    leave_id: str,
    payload: LeaveReview,
    user: dict = Depends(require_permission("leave_requests.approve")),
    db: Client = Depends(get_db),
) -> LeaveOut:
    return service.approve(db, user, leave_id, payload)


@router.post("/{leave_id}/reject", response_model=LeaveOut, summary="Reject a leave request")
def reject(
    leave_id: str,
    payload: LeaveReview,
    user: dict = Depends(require_permission("leave_requests.reject")),
    db: Client = Depends(get_db),
) -> LeaveOut:
    return service.reject(db, user, leave_id, payload)


@router.post("/{leave_id}/cancel", response_model=LeaveOut, summary="Cancel a leave request")
def cancel(
    leave_id: str,
    user: dict = Depends(require_any_permission("leave_requests.approve", "leave_requests.view_own")),
    db: Client = Depends(get_db),
) -> LeaveOut:
    return service.cancel(db, user, leave_id)
