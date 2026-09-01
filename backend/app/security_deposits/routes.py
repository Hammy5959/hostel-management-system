"""Security deposit endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.security_deposits import service
from app.security_deposits.schemas import (
    DepositCreate,
    DepositDeduct,
    DepositList,
    DepositOut,
    DepositReceive,
    DepositRefund,
    DepositUpdate,
)

router = APIRouter(prefix="/security-deposits", tags=["security-deposits"])


@router.get("", response_model=DepositList, summary="List security deposits")
def list_deposits(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    resident_id: str | None = None,
    status: str | None = None,
    _: dict = Depends(require_permission("security_deposits.view")),
    db: Client = Depends(get_db),
) -> DepositList:
    return service.list_deposits(db, page=page, per_page=per_page, resident_id=resident_id, status=status)


@router.post("", response_model=DepositOut, status_code=201, summary="Create a security deposit")
def create(
    payload: DepositCreate,
    _: dict = Depends(require_permission("security_deposits.manage")),
    db: Client = Depends(get_db),
) -> DepositOut:
    return service.create(db, payload)


@router.post("/{deposit_id}/receive", response_model=DepositOut, summary="Receive a security deposit")
def receive(
    deposit_id: str,
    payload: DepositReceive,
    user: dict = Depends(require_permission("security_deposits.manage")),
    db: Client = Depends(get_db),
) -> DepositOut:
    return service.receive(db, user, deposit_id, payload)


@router.post("/{deposit_id}/deduct", response_model=DepositOut, summary="Deduct from a security deposit")
def deduct(
    deposit_id: str,
    payload: DepositDeduct,
    _: dict = Depends(require_permission("security_deposits.manage")),
    db: Client = Depends(get_db),
) -> DepositOut:
    return service.deduct(db, deposit_id, payload)


@router.post("/{deposit_id}/refund", response_model=DepositOut, summary="Refund a security deposit")
def refund(
    deposit_id: str,
    payload: DepositRefund,
    user: dict = Depends(require_permission("security_deposits.manage")),
    db: Client = Depends(get_db),
) -> DepositOut:
    return service.refund(db, user, deposit_id, payload)


@router.patch("/{deposit_id}", response_model=DepositOut, summary="Update deposit notes")
def update(
    deposit_id: str,
    payload: DepositUpdate,
    _: dict = Depends(require_permission("security_deposits.manage")),
    db: Client = Depends(get_db),
) -> DepositOut:
    return service.update(db, deposit_id, payload)
