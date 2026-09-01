"""Building business logic."""

from __future__ import annotations

from supabase import Client

from app.core.exceptions import NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.database.rpc import rpc_call
from app.buildings.schemas import BuildingCreate, BuildingList, BuildingOut, BuildingUpdate

_TABLE = "buildings"

_OCCUPANCY_DEFAULTS = {
    "total_rooms": 0,
    "total_capacity": 0,
    "total_beds": 0,
    "occupied_beds": 0,
    "occupancy_rate": 0.0,
}


def _with_occupancy(row: dict, stats: dict) -> dict:
    """Merge `hms_building_occupancy()` stats onto a raw building row.

    Buildings with no rooms yet are absent from the RPC result — they keep
    the all-zero defaults, which is the correct 0 capacity / 0% state.
    """
    building_stats = stats.get(row["id"], _OCCUPANCY_DEFAULTS)
    total_beds = building_stats["total_beds"]
    occupied_beds = building_stats["occupied_beds"]
    return {
        **row,
        "total_rooms": building_stats["total_rooms"],
        "total_capacity": building_stats["total_capacity"],
        "total_beds": total_beds,
        "occupied_beds": occupied_beds,
        "occupancy_rate": round((occupied_beds / total_beds * 100) if total_beds else 0, 2),
    }


def _fetch_occupancy(db: Client, building_id: str | None = None) -> dict[str, dict]:
    rows = rpc_call(db, "hms_building_occupancy", {"p_building_id": building_id})
    return {row["building_id"]: row for row in rows}


def create_building(db: Client, data: BuildingCreate) -> BuildingOut:
    row = insert(db, _TABLE, data.model_dump(mode="json"))
    return BuildingOut.model_validate(_with_occupancy(row, {}))


def get_building(db: Client, building_id: str) -> BuildingOut:
    row = get_by_id(db, _TABLE, building_id)
    if row is None:
        raise NotFoundError("Building not found", code="building_not_found")
    stats = _fetch_occupancy(db, building_id)
    return BuildingOut.model_validate(_with_occupancy(row, stats))


def list_buildings(
    db: Client, *, page: int, per_page: int, search: str | None, active_only: bool, type: str | None = None,
) -> BuildingList:
    eq: dict = {}
    if active_only:
        eq["is_active"] = True
    if type:
        eq["type"] = type
    items, total = list_page(
        db, _TABLE,
        page=page, per_page=per_page,
        eq=eq or None,
        search=search, search_columns=("name", "code"),
        order="name", desc=False,
    )
    stats = _fetch_occupancy(db) if items else {}
    return BuildingList(
        items=[BuildingOut.model_validate(_with_occupancy(i, stats)) for i in items],
        total=total, page=page, per_page=per_page,
    )


def update_building(db: Client, building_id: str, data: BuildingUpdate) -> BuildingOut:
    if get_by_id(db, _TABLE, building_id) is None:
        raise NotFoundError("Building not found", code="building_not_found")
    row = update(db, _TABLE, building_id, data.model_dump(exclude_unset=True))
    stats = _fetch_occupancy(db, building_id)
    return BuildingOut.model_validate(_with_occupancy(row, stats))
