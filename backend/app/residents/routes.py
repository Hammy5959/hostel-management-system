"""Resident endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.residents import service
from app.residents.schemas import (
    ResidentCheckoutInput,
    ResidentCreate,
    ResidentList,
    ResidentOut,
    ResidentUpdate,
)

router = APIRouter(prefix="/residents", tags=["residents"])


@router.get("", response_model=ResidentList, summary="List residents")
def list_residents(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = None,
    status: str | None = None,
    institution: str | None = None,
    eligible_for_admission: bool = False,
    eligible_for_allocation: bool = False,
    eligible_for_attendance: bool = False,
    eligible_for_billing: bool = False,
    eligible_for_payment: bool = False,
    eligible_for_visitor: bool = False,
    _: dict = Depends(require_permission("residents.view")),
    db: Client = Depends(get_db),
) -> ResidentList:
    return service.list_residents(
        db, page=page, per_page=per_page, search=search, status=status, institution=institution,
        eligible_for_admission=eligible_for_admission, eligible_for_allocation=eligible_for_allocation,
        eligible_for_attendance=eligible_for_attendance, eligible_for_billing=eligible_for_billing,
        eligible_for_payment=eligible_for_payment, eligible_for_visitor=eligible_for_visitor,
    )


@router.post("", response_model=ResidentOut, status_code=201, summary="Create a resident")
def create_resident(
    payload: ResidentCreate,
    _: dict = Depends(require_permission("residents.create")),
    db: Client = Depends(get_db),
) -> ResidentOut:
    return service.create_resident(db, payload)


@router.get("/institutions", response_model=list[str], summary="List distinct resident institutions")
def list_institutions(
    _: dict = Depends(require_permission("residents.view")),
    db: Client = Depends(get_db),
) -> list[str]:
    return service.list_institutions(db)


@router.get("/me", response_model=ResidentOut, summary="Get own resident profile")
def get_me(
    user: dict = Depends(require_permission("residents.view_own")),
    db: Client = Depends(get_db),
) -> ResidentOut:
    return service.get_own_resident(db, user)


@router.patch("/me", response_model=ResidentOut, summary="Update own resident profile")
def update_me(
    payload: ResidentUpdate,
    user: dict = Depends(require_permission("residents.update_own")),
    db: Client = Depends(get_db),
) -> ResidentOut:
    return service.update_own_resident(db, user, payload)


@router.get("/{resident_id}", response_model=ResidentOut, summary="Get a resident")
def get_resident(
    resident_id: str,
    _: dict = Depends(require_permission("residents.view")),
    db: Client = Depends(get_db),
) -> ResidentOut:
    return service.get_resident(db, resident_id)


@router.patch("/{resident_id}", response_model=ResidentOut, summary="Update a resident")
def update_resident(
    resident_id: str,
    payload: ResidentUpdate,
    _: dict = Depends(require_permission("residents.update")),
    db: Client = Depends(get_db),
) -> ResidentOut:
    return service.update_resident(db, resident_id, payload)


@router.post("/{resident_id}/checkout", response_model=ResidentOut, summary="Check out a resident")
def checkout_resident(
    resident_id: str,
    payload: ResidentCheckoutInput,
    user: dict = Depends(require_permission("residents.checkout")),
    db: Client = Depends(get_db),
) -> ResidentOut:
    return service.checkout_resident(db, user, resident_id, payload)


@router.post("/{resident_id}/mark-returned", response_model=ResidentOut, summary="Mark a resident as returned from leave")
def mark_returned(
    resident_id: str,
    user: dict = Depends(require_permission("residents.mark_returned")),
    db: Client = Depends(get_db),
) -> ResidentOut:
    return service.mark_returned(db, user, resident_id)
