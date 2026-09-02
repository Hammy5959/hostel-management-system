"""Gate pass endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_any_permission, require_permission
from app.gate_passes import service
from app.gate_passes.schemas import GatePassAction, GatePassCreate, GatePassList, GatePassOut

router = APIRouter(prefix="/gate-passes", tags=["gate-passes"])


@router.get("", response_model=GatePassList, summary="List gate passes")
def list_passes(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    resident_id: str | None = None,
    status: str | None = None,
    search: str | None = None,
    user: dict = Depends(require_any_permission("gate_passes.view", "gate_passes.view_own")),
    db: Client = Depends(get_db),
) -> GatePassList:
    return service.list_passes(
        db, user, page=page, per_page=per_page, resident_id=resident_id, status=status, search=search
    )


@router.post("", response_model=GatePassOut, status_code=201, summary="Request a gate pass")
def create(
    payload: GatePassCreate,
    user: dict = Depends(require_permission("gate_passes.create")),
    db: Client = Depends(get_db),
) -> GatePassOut:
    return service.create(db, user, payload)


@router.post("/{pass_id}/approve", response_model=GatePassOut, summary="Approve a gate pass")
def approve(
    pass_id: str,
    user: dict = Depends(require_permission("gate_passes.approve")),
    db: Client = Depends(get_db),
) -> GatePassOut:
    return service.approve(db, user, pass_id)


@router.post("/{pass_id}/reject", response_model=GatePassOut, summary="Reject a gate pass")
def reject(
    pass_id: str,
    payload: GatePassAction,
    user: dict = Depends(require_permission("gate_passes.reject")),
    db: Client = Depends(get_db),
) -> GatePassOut:
    return service.reject(db, user, pass_id, payload)


@router.post("/{pass_id}/issue", response_model=GatePassOut, summary="Issue a gate pass")
def issue(
    pass_id: str,
    user: dict = Depends(require_permission("gate_passes.issue")),
    db: Client = Depends(get_db),
) -> GatePassOut:
    return service.issue(db, user, pass_id)


@router.post("/{pass_id}/exit", response_model=GatePassOut, summary="Mark gate pass exit")
def mark_exit(
    pass_id: str,
    payload: GatePassAction,
    user: dict = Depends(require_permission("gate_passes.verify")),
    db: Client = Depends(get_db),
) -> GatePassOut:
    return service.mark_exit(db, user, pass_id, payload)


@router.post("/{pass_id}/return", response_model=GatePassOut, summary="Mark gate pass return")
def mark_return(
    pass_id: str,
    payload: GatePassAction,
    user: dict = Depends(require_permission("gate_passes.verify")),
    db: Client = Depends(get_db),
) -> GatePassOut:
    return service.mark_return(db, user, pass_id, payload)


@router.post("/{pass_id}/cancel", response_model=GatePassOut, summary="Cancel a gate pass")
def cancel(
    pass_id: str,
    user: dict = Depends(require_any_permission("gate_passes.approve", "gate_passes.view_own")),
    db: Client = Depends(get_db),
) -> GatePassOut:
    return service.cancel(db, user, pass_id)
