"""Building endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.buildings import service
from app.buildings.schemas import BuildingCreate, BuildingList, BuildingOut, BuildingUpdate
from app.core.permissions import require_permission

router = APIRouter(prefix="/buildings", tags=["buildings"])


@router.get("", response_model=BuildingList, summary="List buildings")
def list_buildings(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = None,
    active_only: bool = False,
    type: str | None = None,
    _: dict = Depends(require_permission("buildings.view")),
    db: Client = Depends(get_db),
) -> BuildingList:
    return service.list_buildings(db, page=page, per_page=per_page, search=search, active_only=active_only, type=type)


@router.post("", response_model=BuildingOut, status_code=201, summary="Create a building")
def create_building(
    payload: BuildingCreate,
    _: dict = Depends(require_permission("buildings.create")),
    db: Client = Depends(get_db),
) -> BuildingOut:
    return service.create_building(db, payload)


@router.get("/{building_id}", response_model=BuildingOut, summary="Get a building")
def get_building(
    building_id: str,
    _: dict = Depends(require_permission("buildings.view")),
    db: Client = Depends(get_db),
) -> BuildingOut:
    return service.get_building(db, building_id)


@router.patch("/{building_id}", response_model=BuildingOut, summary="Update a building")
def update_building(
    building_id: str,
    payload: BuildingUpdate,
    _: dict = Depends(require_permission("buildings.update")),
    db: Client = Depends(get_db),
) -> BuildingOut:
    return service.update_building(db, building_id, payload)
