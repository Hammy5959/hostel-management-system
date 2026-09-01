"""Staff management endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.staff import service
from app.staff.schemas import StaffCreate, StaffList, StaffOut, StaffUpdate

router = APIRouter(prefix="/staff", tags=["staff"])


@router.get("", response_model=StaffList, summary="List staff")
def list_staff(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = None,
    department: str | None = None,
    _: dict = Depends(require_permission("staff.view")),
    db: Client = Depends(get_db),
) -> StaffList:
    return service.list_staff(db, page=page, per_page=per_page, search=search, department=department)


@router.post("", response_model=StaffOut, status_code=201, summary="Create a staff record")
def create_staff(
    payload: StaffCreate,
    _: dict = Depends(require_permission("staff.create")),
    db: Client = Depends(get_db),
) -> StaffOut:
    return service.create_staff(db, payload)


@router.get("/{staff_id}", response_model=StaffOut, summary="Get a staff record")
def get_staff(
    staff_id: str,
    _: dict = Depends(require_permission("staff.view")),
    db: Client = Depends(get_db),
) -> StaffOut:
    return service.get_staff(db, staff_id)


@router.patch("/{staff_id}", response_model=StaffOut, summary="Update a staff record")
def update_staff(
    staff_id: str,
    payload: StaffUpdate,
    _: dict = Depends(require_permission("staff.update")),
    db: Client = Depends(get_db),
) -> StaffOut:
    return service.update_staff(db, staff_id, payload)
