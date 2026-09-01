"""Invoice endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_any_permission, require_permission
from app.invoices import service
from app.invoices.schemas import InvoiceCreate, InvoiceList, InvoiceOut, InvoiceUpdate

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("", response_model=InvoiceList, summary="List invoices")
def list_invoices(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    resident_id: str | None = None,
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    search: str | None = None,
    user: dict = Depends(require_any_permission("invoices.view", "invoices.view_own")),
    db: Client = Depends(get_db),
) -> InvoiceList:
    return service.list_invoices(
        db, user, page=page, per_page=per_page, resident_id=resident_id, status=status,
        date_from=date_from, date_to=date_to, search=search,
    )


@router.post("", response_model=InvoiceOut, status_code=201, summary="Create an invoice (draft) with items")
def create_invoice(
    payload: InvoiceCreate,
    user: dict = Depends(require_permission("invoices.create")),
    db: Client = Depends(get_db),
) -> InvoiceOut:
    return service.create_invoice(db, user, payload)


@router.get("/{invoice_id}", response_model=InvoiceOut, summary="Get an invoice")
def get_invoice(
    invoice_id: str,
    _: dict = Depends(require_any_permission("invoices.view", "invoices.view_own")),
    db: Client = Depends(get_db),
) -> InvoiceOut:
    return service.get_invoice(db, invoice_id)


@router.patch("/{invoice_id}", response_model=InvoiceOut, summary="Update a draft invoice")
def update_invoice(
    invoice_id: str,
    payload: InvoiceUpdate,
    _: dict = Depends(require_permission("invoices.update")),
    db: Client = Depends(get_db),
) -> InvoiceOut:
    return service.update_invoice(db, invoice_id, payload)


@router.post("/{invoice_id}/issue", response_model=InvoiceOut, summary="Issue an invoice")
def issue_invoice(
    invoice_id: str,
    _: dict = Depends(require_permission("invoices.update")),
    db: Client = Depends(get_db),
) -> InvoiceOut:
    return service.issue_invoice(db, invoice_id)


@router.post("/{invoice_id}/cancel", response_model=InvoiceOut, summary="Cancel an invoice")
def cancel_invoice(
    invoice_id: str,
    _: dict = Depends(require_permission("invoices.update")),
    db: Client = Depends(get_db),
) -> InvoiceOut:
    return service.cancel_invoice(db, invoice_id)
