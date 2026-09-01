"""Asset assignment endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.asset_assignments import service
from app.asset_assignments.schemas import AssignmentCreate, AssignmentList, AssignmentOut, AssignmentReturn
from app.core.permissions import require_permission

router = APIRouter(prefix="/asset-assignments", tags=["asset-assignments"])


@router.get("", response_model=AssignmentList, summary="List asset assignments")
def list_assignments(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    asset_id: str | None = None,
    returned: bool | None = None,
    _: dict = Depends(require_permission("asset_assignments.view")),
    db: Client = Depends(get_db),
) -> AssignmentList:
    return service.list_assignments(db, page=page, per_page=per_page, asset_id=asset_id, returned=returned)


@router.post("", response_model=AssignmentOut, status_code=201, summary="Assign an asset")
def create_assignment(
    payload: AssignmentCreate,
    user: dict = Depends(require_permission("asset_assignments.manage")),
    db: Client = Depends(get_db),
) -> AssignmentOut:
    return service.create_assignment(db, user, payload)


@router.post("/{assignment_id}/return", response_model=AssignmentOut, summary="Return an assigned asset")
def return_assignment(
    assignment_id: str,
    payload: AssignmentReturn,
    _: dict = Depends(require_permission("asset_assignments.manage")),
    db: Client = Depends(get_db),
) -> AssignmentOut:
    return service.return_assignment(db, assignment_id, payload)
