"""Bed endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.beds import service
from app.beds.schemas import BedCreate, BedList, BedOut, BedUpdate
from app.core.permissions import require_permission

router = APIRouter(prefix="/beds", tags=["beds"])


@router.get("", response_model=BedList, summary="List beds")
def list_beds(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    room_id: str | None = None,
    status: str | None = None,
    search: str | None = None,
    _: dict = Depends(require_permission("beds.view")),
    db: Client = Depends(get_db),
) -> BedList:
    return service.list_beds(db, page=page, per_page=per_page, room_id=room_id, status=status, search=search)


@router.post("", response_model=BedOut, status_code=201, summary="Create a bed")
def create_bed(
    payload: BedCreate,
    _: dict = Depends(require_permission("beds.create")),
    db: Client = Depends(get_db),
) -> BedOut:
    return service.create_bed(db, payload)


@router.get("/{bed_id}", response_model=BedOut, summary="Get a bed")
def get_bed(
    bed_id: str,
    _: dict = Depends(require_permission("beds.view")),
    db: Client = Depends(get_db),
) -> BedOut:
    return service.get_bed(db, bed_id)


@router.patch("/{bed_id}", response_model=BedOut, summary="Update a bed")
def update_bed(
    bed_id: str,
    payload: BedUpdate,
    _: dict = Depends(require_permission("beds.update")),
    db: Client = Depends(get_db),
) -> BedOut:
    return service.update_bed(db, bed_id, payload)
