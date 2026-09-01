"""Floor endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.floors import service
from app.floors.schemas import FloorCreate, FloorList, FloorOut, FloorUpdate

router = APIRouter(prefix="/floors", tags=["floors"])


@router.get("", response_model=FloorList, summary="List floors")
def list_floors(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    building_id: str | None = None,
    search: str | None = None,
    _: dict = Depends(require_permission("floors.view")),
    db: Client = Depends(get_db),
) -> FloorList:
    return service.list_floors(db, page=page, per_page=per_page, building_id=building_id, search=search)


@router.post("", response_model=FloorOut, status_code=201, summary="Create a floor")
def create_floor(
    payload: FloorCreate,
    _: dict = Depends(require_permission("floors.create")),
    db: Client = Depends(get_db),
) -> FloorOut:
    return service.create_floor(db, payload)


@router.get("/{floor_id}", response_model=FloorOut, summary="Get a floor")
def get_floor(
    floor_id: str,
    _: dict = Depends(require_permission("floors.view")),
    db: Client = Depends(get_db),
) -> FloorOut:
    return service.get_floor(db, floor_id)


@router.patch("/{floor_id}", response_model=FloorOut, summary="Update a floor")
def update_floor(
    floor_id: str,
    payload: FloorUpdate,
    _: dict = Depends(require_permission("floors.update")),
    db: Client = Depends(get_db),
) -> FloorOut:
    return service.update_floor(db, floor_id, payload)
