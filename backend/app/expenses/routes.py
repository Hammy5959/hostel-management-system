"""Expense endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.expenses import service
from app.expenses.schemas import ExpenseCreate, ExpenseList, ExpenseOut, ExpenseUpdate

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.get("", response_model=ExpenseList, summary="List expenses")
def list_expenses(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    category: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    search: str | None = None,
    _: dict = Depends(require_permission("expenses.view")),
    db: Client = Depends(get_db),
) -> ExpenseList:
    return service.list_expenses(db, page=page, per_page=per_page, category=category, date_from=date_from, date_to=date_to, search=search)


@router.post("", response_model=ExpenseOut, status_code=201, summary="Record an expense")
def create(
    payload: ExpenseCreate,
    user: dict = Depends(require_permission("expenses.create")),
    db: Client = Depends(get_db),
) -> ExpenseOut:
    return service.create(db, user, payload)


@router.get("/{expense_id}", response_model=ExpenseOut, summary="Get an expense")
def get(
    expense_id: str,
    _: dict = Depends(require_permission("expenses.view")),
    db: Client = Depends(get_db),
) -> ExpenseOut:
    return service.get(db, expense_id)


@router.patch("/{expense_id}", response_model=ExpenseOut, summary="Update an expense")
def update(
    expense_id: str,
    payload: ExpenseUpdate,
    _: dict = Depends(require_permission("expenses.update")),
    db: Client = Depends(get_db),
) -> ExpenseOut:
    return service.update(db, expense_id, payload)
