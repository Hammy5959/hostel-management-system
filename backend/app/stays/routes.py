"""Resident stay endpoints (check-in / check-out)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_any_permission, require_permission
from app.stays import service
from app.stays.schemas import StayCheckIn, StayCheckOut, StayCreate, StayList, StayOut

router = APIRouter(prefix="/resident-stays", tags=["resident-stays"])


@router.get("", response_model=StayList, summary="List resident stays")
def list_stays(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    resident_id: str | None = None,
    status: str | None = None,
    user: dict = Depends(require_any_permission("stays.view", "stays.view_own")),
    db: Client = Depends(get_db),
) -> StayList:
    return service.list_stays(db, user, page=page, per_page=per_page, resident_id=resident_id, status=status)


@router.post("", response_model=StayOut, status_code=201, summary="Schedule a stay for an allocation")
def create_stay(
    payload: StayCreate,
    _: dict = Depends(require_permission("stays.create")),
    db: Client = Depends(get_db),
) -> StayOut:
    return service.create_stay(db, payload)


@router.post("/{stay_id}/check-in", response_model=StayOut, summary="Check in a resident")
def check_in(
    stay_id: str,
    payload: StayCheckIn,
    user: dict = Depends(require_permission("stays.check_in")),
    db: Client = Depends(get_db),
) -> StayOut:
    return service.check_in(db, user, stay_id, payload)


@router.post("/{stay_id}/check-out", response_model=StayOut, summary="Check out a resident")
def check_out(
    stay_id: str,
    payload: StayCheckOut,
    user: dict = Depends(require_permission("stays.check_out")),
    db: Client = Depends(get_db),
) -> StayOut:
    return service.check_out(db, user, stay_id, payload)
