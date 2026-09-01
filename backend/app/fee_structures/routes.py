"""Fee structure endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.fee_structures import service
from app.fee_structures.schemas import FeeStructureCreate, FeeStructureList, FeeStructureOut, FeeStructureUpdate

router = APIRouter(prefix="/fee-structures", tags=["fee-structures"])


@router.get("", response_model=FeeStructureList, summary="List fee structures")
def list_fee_structures(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = None,
    is_active: bool | None = None,
    _: dict = Depends(require_permission("fee_structures.view")),
    db: Client = Depends(get_db),
) -> FeeStructureList:
    return service.list_fee_structures(db, page=page, per_page=per_page, search=search, is_active=is_active)


@router.post("", response_model=FeeStructureOut, status_code=201, summary="Create a fee structure")
def create(
    payload: FeeStructureCreate,
    user: dict = Depends(require_permission("fee_structures.manage")),
    db: Client = Depends(get_db),
) -> FeeStructureOut:
    return service.create(db, user, payload)


@router.get("/{fee_structure_id}", response_model=FeeStructureOut, summary="Get a fee structure")
def get(
    fee_structure_id: str,
    _: dict = Depends(require_permission("fee_structures.view")),
    db: Client = Depends(get_db),
) -> FeeStructureOut:
    return service.get(db, fee_structure_id)


@router.patch("/{fee_structure_id}", response_model=FeeStructureOut, summary="Update a fee structure")
def update(
    fee_structure_id: str,
    payload: FeeStructureUpdate,
    _: dict = Depends(require_permission("fee_structures.manage")),
    db: Client = Depends(get_db),
) -> FeeStructureOut:
    return service.update(db, fee_structure_id, payload)
