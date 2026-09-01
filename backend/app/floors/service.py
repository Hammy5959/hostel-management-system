"""Floor business logic."""

from __future__ import annotations

from supabase import Client

from app.core.exceptions import NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.database.rpc import rpc_call
from app.floors.schemas import FloorCreate, FloorList, FloorOut, FloorUpdate

_TABLE = "floors"
_SELECT = "*, buildings(name)"

_OCCUPANCY_DEFAULTS = {
    "total_rooms": 0,
    "total_beds": 0,
    "occupied_beds": 0,
}


def _with_occupancy(row: dict, stats: dict, building_name: str | None = None) -> dict:
    """Flatten the embedded `buildings(name)` row and merge
    `hms_floor_occupancy()` stats onto a raw floor row.

    Floors with no rooms yet are absent from the RPC result — they keep the
    all-zero defaults, which is the correct 0 rooms / 0 beds / 0% state.
    """
    building = row.pop("buildings", None)
    resolved_building_name = building_name or (building or {}).get("name")

    floor_stats = stats.get(row["id"], _OCCUPANCY_DEFAULTS)
    total_beds = floor_stats["total_beds"]
    occupied_beds = floor_stats["occupied_beds"]
    return {
        **row,
        "building_name": resolved_building_name,
        "total_rooms": floor_stats["total_rooms"],
        "total_beds": total_beds,
        "occupied_beds": occupied_beds,
        "available_beds": total_beds - occupied_beds,
        "occupancy_rate": round((occupied_beds / total_beds * 100) if total_beds else 0, 2),
    }


def _fetch_occupancy(db: Client, floor_id: str | None = None) -> dict[str, dict]:
    rows = rpc_call(db, "hms_floor_occupancy", {"p_floor_id": floor_id})
    return {row["floor_id"]: row for row in rows}


def create_floor(db: Client, data: FloorCreate) -> FloorOut:
    # Referenced building must exist (FK would also raise, but fail fast with a clear error).
    building = get_by_id(db, "buildings", str(data.building_id))
    if building is None:
        raise NotFoundError("Building not found", code="building_not_found")
    row = insert(db, _TABLE, data.model_dump(mode="json"))
    return FloorOut.model_validate(_with_occupancy(row, {}, building_name=building["name"]))


def get_floor(db: Client, floor_id: str) -> FloorOut:
    res = db.table(_TABLE).select(_SELECT).eq("id", floor_id).execute()
    if not res.data:
        raise NotFoundError("Floor not found", code="floor_not_found")
    row = res.data[0]
    stats = _fetch_occupancy(db, floor_id)
    return FloorOut.model_validate(_with_occupancy(row, stats))


def list_floors(
    db: Client,
    *,
    page: int,
    per_page: int,
    building_id: str | None,
    search: str | None,
) -> FloorList:
    eq = {"building_id": building_id} if building_id else None
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        select=_SELECT,
        eq=eq, search=search, search_columns=("name",),
        order="floor_number", desc=False,
    )
    stats = _fetch_occupancy(db) if items else {}
    return FloorList(
        items=[FloorOut.model_validate(_with_occupancy(i, stats)) for i in items],
        total=total, page=page, per_page=per_page,
    )


def update_floor(db: Client, floor_id: str, data: FloorUpdate) -> FloorOut:
    if get_by_id(db, _TABLE, floor_id) is None:
        raise NotFoundError("Floor not found", code="floor_not_found")
    update(db, _TABLE, floor_id, data.model_dump(exclude_unset=True))
    return get_floor(db, floor_id)
