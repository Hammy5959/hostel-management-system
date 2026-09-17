"""Expense business logic."""

from __future__ import annotations

from supabase import Client

from app.audit.service import record_audit
from app.common.numbers import generate_number
from app.core.exceptions import NotFoundError
from app.database.crud import get_by_id, insert, list_page
from app.database.crud import update as db_update
from app.expenses.schemas import ExpenseCreate, ExpenseList, ExpenseOut, ExpenseUpdate

_TABLE = "expenses"


def create(db: Client, user: dict, data: ExpenseCreate) -> ExpenseOut:
    payload = data.model_dump(mode="json")
    payload["expense_number"] = payload.get("expense_number") or generate_number("EXP")
    payload["created_by"] = user["id"]
    expense = ExpenseOut.model_validate(insert(db, _TABLE, payload))
    record_audit(
        db,
        user_id=user["id"],
        action="expense.create",
        module="expenses",
        entity_type="expense",
        entity_id=str(expense.id),
        description=f"Recorded expense {expense.expense_number} of {expense.amount}",
        new_values={"amount": str(expense.amount), "category": expense.category},
        ip_address=user.get("_ip_address"),
        user_agent=user.get("_user_agent"),
    )
    return expense


def get(db: Client, expense_id: str) -> ExpenseOut:
    row = get_by_id(db, _TABLE, expense_id)
    if row is None:
        raise NotFoundError("Expense not found", code="expense_not_found")
    return ExpenseOut.model_validate(row)


def list_expenses(
    db: Client,
    *,
    page: int,
    per_page: int,
    category: str | None,
    date_from: str | None,
    date_to: str | None,
    search: str | None,
) -> ExpenseList:
    eq = {"category": category} if category else None
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        eq=eq,
        gte={"expense_date": date_from} if date_from else None,
        lte={"expense_date": date_to} if date_to else None,
        search=search, search_columns=("description", "vendor", "expense_number"),
        order="expense_date", desc=True,
    )
    return ExpenseList(items=[ExpenseOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def update(db: Client, user: dict, expense_id: str, data: ExpenseUpdate) -> ExpenseOut:
    existing = get_by_id(db, _TABLE, expense_id)
    if existing is None:
        raise NotFoundError("Expense not found", code="expense_not_found")
    payload = data.model_dump(exclude_unset=True)
    updated = ExpenseOut.model_validate(db_update(db, _TABLE, expense_id, payload))
    if payload:
        record_audit(
            db,
            user_id=user["id"],
            action="expense.update",
            module="expenses",
            entity_type="expense",
            entity_id=expense_id,
            description=f"Updated expense {existing.get('expense_number')}",
            old_values={k: existing.get(k) for k in payload},
            new_values=payload,
            ip_address=user.get("_ip_address"),
            user_agent=user.get("_user_agent"),
        )
    return updated
