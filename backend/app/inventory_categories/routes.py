"""Inventory category endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.inventory_categories import service
from app.inventory_categories.schemas import CategoryCreate, CategoryList, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/inventory-categories", tags=["inventory-categories"])


@router.get("", response_model=CategoryList, summary="List inventory categories")
def list_categories(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = None,
    _: dict = Depends(require_permission("inventory_categories.view")),
    db: Client = Depends(get_db),
) -> CategoryList:
    return service.list_categories(db, page=page, per_page=per_page, search=search)


@router.post("", response_model=CategoryOut, status_code=201, summary="Create an inventory category")
def create(
    payload: CategoryCreate,
    _: dict = Depends(require_permission("inventory_categories.manage")),
    db: Client = Depends(get_db),
) -> CategoryOut:
    return service.create(db, payload)


@router.get("/{category_id}", response_model=CategoryOut, summary="Get an inventory category")
def get(
    category_id: str,
    _: dict = Depends(require_permission("inventory_categories.view")),
    db: Client = Depends(get_db),
) -> CategoryOut:
    return service.get(db, category_id)


@router.patch("/{category_id}", response_model=CategoryOut, summary="Update an inventory category")
def update(
    category_id: str,
    payload: CategoryUpdate,
    _: dict = Depends(require_permission("inventory_categories.manage")),
    db: Client = Depends(get_db),
) -> CategoryOut:
    return service.update(db, category_id, payload)
