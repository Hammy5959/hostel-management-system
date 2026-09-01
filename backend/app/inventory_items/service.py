"""Inventory item business logic.

Stock can never go negative: enforced both by a CHECK constraint and by
service-level validation on delta adjustments.
"""

from __future__ import annotations

from supabase import Client

from app.audit.service import record_audit
from app.core.exceptions import BadRequestError, NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.database.supabase import raise_for_error
from app.inventory_items.schemas import InventoryItemCreate, InventoryItemList, InventoryItemOut, InventoryItemUpdate, StockAdjustment

_TABLE = "inventory_items"


def _fetch(db: Client, item_id: str) -> dict:
    row = get_by_id(db, _TABLE, item_id)
    if row is None:
        raise NotFoundError("Inventory item not found", code="inventory_item_not_found")
    return row


def create(db: Client, data: InventoryItemCreate) -> InventoryItemOut:
    if data.category_id and get_by_id(db, "inventory_categories", str(data.category_id)) is None:
        raise NotFoundError("Inventory category not found", code="category_not_found")
    return InventoryItemOut.model_validate(insert(db, _TABLE, data.model_dump(mode="json")))


def get(db: Client, item_id: str) -> InventoryItemOut:
    return InventoryItemOut.model_validate(_fetch(db, item_id))


def list_items(
    db: Client,
    *,
    page: int,
    per_page: int,
    category_id: str | None,
    low_stock_only: bool,
    search: str | None,
) -> InventoryItemList:
    eq: dict = {}
    if category_id:
        eq["category_id"] = category_id
    if low_stock_only:
        # PostgREST cannot compare two columns (quantity <= minimum_quantity),
        # so the cross-column filter runs here in Python. Inventory is small
        # (hundreds of rows) and only the final page is returned; search and
        # category filters are still applied in the database.
        query = db.table(_TABLE).select("*", count="exact")
        if search:
            query = query.or_(f"name.ilike.*{search}*,sku.ilike.*{search}*")
        for col, val in eq.items():
            query = query.eq(col, val)
        res = query.execute()
        if getattr(res, "error", None):
            raise_for_error(res, "list low-stock items")
        filtered = [r for r in res.data if r["quantity"] <= r["minimum_quantity"]]
        total = len(filtered)
        start = (page - 1) * per_page
        items = sorted(filtered, key=lambda r: r["name"])[start : start + per_page]
        return InventoryItemList(items=[InventoryItemOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)

    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page, eq=eq or None,
        search=search, search_columns=("name", "sku"),
        order="name", desc=False,
    )
    return InventoryItemList(items=[InventoryItemOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def update(db: Client, item_id: str, data: InventoryItemUpdate) -> InventoryItemOut:
    _fetch(db, item_id)
    return InventoryItemOut.model_validate(update(db, _TABLE, item_id, data.model_dump(exclude_unset=True)))


def adjust_stock(db: Client, item_id: str, data: StockAdjustment) -> InventoryItemOut:
    item = _fetch(db, item_id)
    new_quantity = item["quantity"] + data.delta
    if new_quantity < 0:
        raise BadRequestError(
            f"Stock cannot go below zero (current: {item['quantity']})", code="insufficient_stock"
        )
    res = db.table(_TABLE).update({"quantity": new_quantity}).eq("id", item_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "adjust stock")
    record_audit(
        db,
        action="inventory.adjust",
        module="inventory_items",
        entity_type="inventory_item",
        entity_id=item_id,
        description=f"Adjusted stock of {item['name']} by {data.delta} ({data.reason or 'no reason'})",
        old_values={"quantity": item["quantity"]},
        new_values={"quantity": new_quantity},
    )
    return InventoryItemOut.model_validate(res.data[0])
