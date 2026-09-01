"""Room allocation endpoints."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.allocations import service
from app.allocations.schemas import AllocationCreate, AllocationList, AllocationOut, AllocationTransfer
from app.api.deps import get_db
from app.core.permissions import require_any_permission, require_permission

router = APIRouter(prefix="/room-allocations", tags=["room-allocations"])


@router.get("", response_model=AllocationList, summary="List allocations")
def list_allocations(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    resident_id: str | None = None,
    room_id: str | None = None,
    building_id: str | None = None,
    status: str | None = None,
    active_only: bool = False,
    search: str | None = None,
    date_from: date | None = None,
    user: dict = Depends(require_any_permission("allocations.view", "allocations.view_own")),
    db: Client = Depends(get_db),
) -> AllocationList:
    return service.list_allocations(
        db, user, page=page, per_page=per_page, resident_id=resident_id, room_id=room_id,
        building_id=building_id, status=status, active_only=active_only, search=search, date_from=date_from,
    )


@router.post("", response_model=AllocationOut, status_code=201, summary="Allocate a bed to a resident")
def create_allocation(
    payload: AllocationCreate,
    user: dict = Depends(require_permission("allocations.create")),
    db: Client = Depends(get_db),
) -> AllocationOut:
    return service.create_allocation(db, user, payload)


@router.post("/{allocation_id}/transfer", response_model=AllocationOut, summary="Transfer an allocation to another bed")
def transfer_allocation(
    allocation_id: str,
    payload: AllocationTransfer,
    user: dict = Depends(require_permission("allocations.transfer")),
    db: Client = Depends(get_db),
) -> AllocationOut:
    return service.transfer_allocation(db, user, allocation_id, payload)


@router.post("/{allocation_id}/release", response_model=AllocationOut, summary="Release (complete) an allocation")
def release_allocation(
    allocation_id: str,
    _: dict = Depends(require_permission("allocations.update")),
    db: Client = Depends(get_db),
) -> AllocationOut:
    return service.release_allocation(db, allocation_id)
