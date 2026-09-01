"""Inventory category business logic."""

from __future__ import annotations

from supabase import Client

from app.core.exceptions import NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.inventory_categories.schemas import CategoryCreate, CategoryList, CategoryOut, CategoryUpdate

_TABLE = "inventory_categories"


def create(db: Client, data: CategoryCreate) -> CategoryOut:
    return CategoryOut.model_validate(insert(db, _TABLE, data.model_dump(mode="json")))


def get(db: Client, category_id: str) -> CategoryOut:
    row = get_by_id(db, _TABLE, category_id)
    if row is None:
        raise NotFoundError("Inventory category not found", code="category_not_found")
    return CategoryOut.model_validate(row)


def list_categories(db: Client, *, page: int, per_page: int, search: str | None) -> CategoryList:
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        search=search, search_columns=("name",),
        order="name", desc=False,
    )
    return CategoryList(items=[CategoryOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def update(db: Client, category_id: str, data: CategoryUpdate) -> CategoryOut:
    if get_by_id(db, _TABLE, category_id) is None:
        raise NotFoundError("Inventory category not found", code="category_not_found")
    return CategoryOut.model_validate(update(db, _TABLE, category_id, data.model_dump(exclude_unset=True)))
