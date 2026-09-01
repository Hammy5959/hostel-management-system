"""Admission endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.admissions import service
from app.admissions.schemas import AdmissionCreate, AdmissionList, AdmissionOut, AdmissionUpdate
from app.api.deps import get_db
from app.core.permissions import require_any_permission, require_permission

router = APIRouter(prefix="/admissions", tags=["admissions"])


@router.get("", response_model=AdmissionList, summary="List admissions")
def list_admissions(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    resident_id: str | None = None,
    status: str | None = None,
    search: str | None = None,
    available_for_allocation: bool = False,
    user: dict = Depends(require_any_permission("admissions.view", "admissions.view_own")),
    db: Client = Depends(get_db),
) -> AdmissionList:
    return service.list_admissions(
        db, user, page=page, per_page=per_page, resident_id=resident_id, status=status, search=search,
        available_for_allocation=available_for_allocation,
    )


@router.post("", response_model=AdmissionOut, status_code=201, summary="Create an admission application")
def create_admission(
    payload: AdmissionCreate,
    user: dict = Depends(require_permission("admissions.create")),
    db: Client = Depends(get_db),
) -> AdmissionOut:
    return service.create_admission(db, user, payload)


@router.get("/{admission_id}", response_model=AdmissionOut, summary="Get an admission")
def get_admission(
    admission_id: str,
    _: dict = Depends(require_permission("admissions.view")),
    db: Client = Depends(get_db),
) -> AdmissionOut:
    return service.get_admission(db, admission_id)


@router.patch("/{admission_id}", response_model=AdmissionOut, summary="Update admission details")
def update_admission(
    admission_id: str,
    payload: AdmissionUpdate,
    _: dict = Depends(require_permission("admissions.update")),
    db: Client = Depends(get_db),
) -> AdmissionOut:
    return service.update_admission(db, admission_id, payload)


@router.post("/{admission_id}/approve", response_model=AdmissionOut, summary="Approve an admission")
def approve_admission(
    admission_id: str,
    user: dict = Depends(require_permission("admissions.approve")),
    db: Client = Depends(get_db),
) -> AdmissionOut:
    return service.approve_admission(db, user, admission_id)


@router.post("/{admission_id}/reject", response_model=AdmissionOut, summary="Reject an admission")
def reject_admission(
    admission_id: str,
    notes: str | None = Query(default=None),
    user: dict = Depends(require_permission("admissions.reject")),
    db: Client = Depends(get_db),
) -> AdmissionOut:
    return service.reject_admission(db, user, admission_id, notes=notes)


@router.post("/{admission_id}/cancel", response_model=AdmissionOut, summary="Cancel an admission")
def cancel_admission(
    admission_id: str,
    _: dict = Depends(require_permission("admissions.update")),
    db: Client = Depends(get_db),
) -> AdmissionOut:
    return service.cancel_admission(db, admission_id)
