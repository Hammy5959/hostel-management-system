"""Bed business logic."""

from __future__ import annotations

from supabase import Client

from app.core.exceptions import ConflictError, NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.database.supabase import raise_for_error
from app.beds.schemas import BedCreate, BedList, BedOut, BedUpdate

_TABLE = "beds"


def create_bed(db: Client, data: BedCreate) -> BedOut:
    room = get_by_id(db, "rooms", str(data.room_id))
    if room is None:
        raise NotFoundError("Room not found", code="room_not_found")

    res = db.table(_TABLE).select("id", count="exact").eq("room_id", str(data.room_id)).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "count beds")
    current_count = int(res.count or 0)
    if current_count >= room["capacity"]:
        raise ConflictError(
            f"This room's bed capacity ({room['capacity']}) is already full. "
            "Increase the room's capacity before adding more beds.",
            code="bed_capacity_exceeded",
        )

    return BedOut.model_validate(insert(db, _TABLE, data.model_dump(mode="json")))


def get_bed(db: Client, bed_id: str) -> BedOut:
    row = get_by_id(db, _TABLE, bed_id)
    if row is None:
        raise NotFoundError("Bed not found", code="bed_not_found")
    return BedOut.model_validate(row)


def list_beds(
    db: Client,
    *,
    page: int,
    per_page: int,
    room_id: str | None,
    status: str | None,
    search: str | None,
) -> BedList:
    eq: dict = {}
    if room_id:
        eq["room_id"] = room_id
    if status:
        eq["status"] = status
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        eq=eq or None, search=search, search_columns=("bed_number",),
        order="bed_number", desc=False,
    )
    return BedList(items=[BedOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def update_bed(db: Client, bed_id: str, data: BedUpdate) -> BedOut:
    if get_by_id(db, _TABLE, bed_id) is None:
        raise NotFoundError("Bed not found", code="bed_not_found")
    return BedOut.model_validate(update(db, _TABLE, bed_id, data.model_dump(exclude_unset=True)))
