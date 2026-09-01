"""Payment endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_any_permission, require_permission
from app.payments import service
from app.payments.schemas import PaymentCreate, PaymentList, PaymentOut

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("", response_model=PaymentList, summary="List payments")
def list_payments(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    resident_id: str | None = None,
    invoice_id: str | None = None,
    payment_method: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    search: str | None = None,
    user: dict = Depends(require_any_permission("payments.view", "payments.view_own")),
    db: Client = Depends(get_db),
) -> PaymentList:
    return service.list_payments(
        db, user, page=page, per_page=per_page, resident_id=resident_id, invoice_id=invoice_id,
        payment_method=payment_method, date_from=date_from, date_to=date_to, search=search,
    )


@router.post("", response_model=PaymentOut, status_code=201, summary="Record a payment against an invoice")
def record_payment(
    payload: PaymentCreate,
    user: dict = Depends(require_permission("payments.create")),
    db: Client = Depends(get_db),
) -> PaymentOut:
    return service.record_payment(db, user, payload)
