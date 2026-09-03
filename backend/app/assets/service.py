"""Asset business logic."""

from __future__ import annotations

from supabase import Client

from app.common.numbers import generate_number
from app.core.exceptions import NotFoundError
from app.database.crud import get_by_id, insert, list_page, update as crud_update
from app.assets.schemas import AssetCreate, AssetList, AssetOut, AssetUpdate

_TABLE = "assets"


def create(db: Client, data: AssetCreate) -> AssetOut:
    if data.inventory_item_id and get_by_id(db, "inventory_items", str(data.inventory_item_id)) is None:
        raise NotFoundError("Inventory item not found", code="inventory_item_not_found")
    payload = data.model_dump(mode="json")
    payload["asset_number"] = payload.get("asset_number") or generate_number("AST")
    return AssetOut.model_validate(insert(db, _TABLE, payload))


def get(db: Client, asset_id: str) -> AssetOut:
    row = get_by_id(db, _TABLE, asset_id)
    if row is None:
        raise NotFoundError("Asset not found", code="asset_not_found")
    return AssetOut.model_validate(row)


def list_assets(
    db: Client, *, page: int, per_page: int, status: str | None, category_id: str | None, search: str | None
) -> AssetList:
    eq: dict = {}
    if status:
        eq["status"] = status
    if category_id:
        # Assets reference inventory items which carry the category; filter DB-side via the embedded relation.
        query = (
            db.table(_TABLE)
            .select("*", count="exact")
            .eq("inventory_items.category_id", category_id)
            .range((page - 1) * per_page, page * per_page - 1)
        )
        res = query.execute()
        if getattr(res, "error", None):
            from app.database.supabase import raise_for_error
            raise_for_error(res, "list assets by category")
        items, total = res.data, int(res.count or 0)
        return AssetList(items=[AssetOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page, eq=eq or None,
        search=search, search_columns=("name", "asset_number", "serial_number"),
        order="name", desc=False,
    )
    return AssetList(items=[AssetOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def update(db: Client, asset_id: str, data: AssetUpdate) -> AssetOut:
    if get_by_id(db, _TABLE, asset_id) is None:
        raise NotFoundError("Asset not found", code="asset_not_found")
    return AssetOut.model_validate(
    crud_update(
        db,
        _TABLE,
        asset_id,
        data.model_dump(mode="json", exclude_unset=True),
    )
)
