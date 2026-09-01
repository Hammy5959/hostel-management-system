"""Inventory item endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.inventory_items import service
from app.inventory_items.schemas import InventoryItemCreate, InventoryItemList, InventoryItemOut, InventoryItemUpdate, StockAdjustment

router = APIRouter(prefix="/inventory-items", tags=["inventory-items"])


@router.get("", response_model=InventoryItemList, summary="List inventory items")
def list_items(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    category_id: str | None = None,
    low_stock_only: bool = False,
    search: str | None = None,
    _: dict = Depends(require_permission("inventory_items.view")),
    db: Client = Depends(get_db),
) -> InventoryItemList:
    return service.list_items(db, page=page, per_page=per_page, category_id=category_id, low_stock_only=low_stock_only, search=search)


@router.post("", response_model=InventoryItemOut, status_code=201, summary="Create an inventory item")
def create(
    payload: InventoryItemCreate,
    _: dict = Depends(require_permission("inventory_items.manage")),
    db: Client = Depends(get_db),
) -> InventoryItemOut:
    return service.create(db, payload)


@router.get("/{item_id}", response_model=InventoryItemOut, summary="Get an inventory item")
def get(
    item_id: str,
    _: dict = Depends(require_permission("inventory_items.view")),
    db: Client = Depends(get_db),
) -> InventoryItemOut:
    return service.get(db, item_id)


@router.patch("/{item_id}", response_model=InventoryItemOut, summary="Update an inventory item")
def update(
    item_id: str,
    payload: InventoryItemUpdate,
    _: dict = Depends(require_permission("inventory_items.manage")),
    db: Client = Depends(get_db),
) -> InventoryItemOut:
    return service.update(db, item_id, payload)


@router.post("/{item_id}/adjust", response_model=InventoryItemOut, summary="Adjust stock quantity by a delta")
def adjust_stock(
    item_id: str,
    payload: StockAdjustment,
    _: dict = Depends(require_permission("inventory_items.update")),
    db: Client = Depends(get_db),
) -> InventoryItemOut:
    return service.adjust_stock(db, item_id, payload)
