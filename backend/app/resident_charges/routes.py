"""Resident charge endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.resident_charges import service
from app.resident_charges.schemas import ResidentChargeCreate, ResidentChargeList, ResidentChargeOut, ResidentChargeUpdate

router = APIRouter(prefix="/resident-charges", tags=["resident-charges"])


@router.get("", response_model=ResidentChargeList, summary="List resident charges")
def list_charges(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    resident_id: str | None = None,
    status: str | None = None,
    search: str | None = None,
    _: dict = Depends(require_permission("resident_charges.view")),
    db: Client = Depends(get_db),
) -> ResidentChargeList:
    return service.list_charges(
        db, page=page, per_page=per_page, resident_id=resident_id, status=status, search=search
    )


@router.post("", response_model=ResidentChargeOut, status_code=201, summary="Create a resident charge")
def create(
    payload: ResidentChargeCreate,
    user: dict = Depends(require_permission("resident_charges.create")),
    db: Client = Depends(get_db),
) -> ResidentChargeOut:
    return service.create(db, user, payload)


@router.get("/{charge_id}", response_model=ResidentChargeOut, summary="Get a resident charge")
def get(
    charge_id: str,
    _: dict = Depends(require_permission("resident_charges.view")),
    db: Client = Depends(get_db),
) -> ResidentChargeOut:
    return service.get(db, charge_id)


@router.patch("/{charge_id}", response_model=ResidentChargeOut, summary="Update a resident charge")
def update(
    charge_id: str,
    payload: ResidentChargeUpdate,
    _: dict = Depends(require_permission("resident_charges.update")),
    db: Client = Depends(get_db),
) -> ResidentChargeOut:
    return service.update(db, charge_id, payload)
