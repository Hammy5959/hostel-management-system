"""Room business logic."""

from __future__ import annotations

from datetime import date, datetime

from supabase import Client

from app.core.exceptions import NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.database.rpc import rpc_call
from app.database.supabase import raise_for_error
from app.invoices.service import (
    get_earliest_outstanding_invoice_by_resident,
    get_residents_with_any_invoice,
)
from app.rooms.schemas import (
    RentStatusOut,
    RoomCreate,
    RoomDetailBedOut,
    RoomDetailOut,
    RoomDetailResidentOut,
    RoomDetailSummaryOut,
    RoomList,
    RoomOut,
    RoomSummaryOut,
    RoomUpdate,
)

_TABLE = "rooms"

# Embeds the room's floor (and that floor's building) plus its beds, in one
# query — no extra RPC needed, unlike the building/floor occupancy rollups
# (those group *across* many rooms, which PostgREST can't do in a single
# embedded select).
#
# `floors!inner(...)` (not a plain `floors(...)` embed) is required for the
# `building_id` filter below to work: PostgREST's embedded-relationship
# filters only null out a non-matching *embed*, they don't exclude the parent
# row, unless the embed is forced to an inner join. Every room has a
# non-nullable floor_id (FK, ON DELETE RESTRICT), so forcing the join to
# INNER never drops a room that would otherwise have matched.
_SELECT = "*, floors!inner(name, buildings(id, name, type)), beds(status)"


def _with_room_details(row: dict, residents_by_room: dict[str, list[dict]]) -> dict:
    """Flatten the embedded floor/building/beds rows and attach current
    residents onto a raw room row.

    Bed counts come straight from the embedded `beds` rows — `occupied_beds`
    is a count of `status = 'occupied'`, the same value the allocation RPCs
    (hms_allocate_bed / hms_release_allocation / hms_transfer_allocation) keep
    authoritative. A room with no beds yet is 0/0, not an error.
    """
    floor = row.pop("floors", None) or {}
    building = floor.get("buildings") or {}
    beds = row.pop("beds", None) or []
    total_beds = len(beds)
    occupied_beds = sum(1 for b in beds if b.get("status") == "occupied")
    return {
        **row,
        "floor_name": floor.get("name"),
        "building_id": building.get("id"),
        "building_name": building.get("name"),
        "building_type": building.get("type"),
        "total_beds": total_beds,
        "occupied_beds": occupied_beds,
        "available_beds": total_beds - occupied_beds,
        "current_residents": residents_by_room.get(str(row["id"]), []),
    }


def _fetch_current_residents(db: Client, room_ids: list[str]) -> dict[str, list[dict]]:
    """Residents with a currently-active `room_allocations` row for a bed in
    each of `room_ids`, grouped by room id — mirrors the same
    `residents(first_name, last_name, ...)` embed pattern already used by
    `app.allocations.service`."""
    if not room_ids:
        return {}
    res = (
        db.table("room_allocations")
        .select("room_id, residents(id, first_name, last_name)")
        .eq("status", "active")
        .in_("room_id", room_ids)
        .execute()
    )
    if getattr(res, "error", None):
        raise_for_error(res, "list room residents")
    grouped: dict[str, list[dict]] = {}
    for row in res.data or []:
        resident = row.get("residents")
        if not resident:
            continue
        grouped.setdefault(row["room_id"], []).append(resident)
    return grouped


def create_room(db: Client, data: RoomCreate) -> RoomOut:
    if get_by_id(db, "floors", str(data.floor_id)) is None:
        raise NotFoundError("Floor not found", code="floor_not_found")
    row = insert(db, _TABLE, data.model_dump(mode="json"))
    return get_room(db, row["id"])


def get_room(db: Client, room_id: str) -> RoomOut:
    res = db.table(_TABLE).select(_SELECT).eq("id", room_id).execute()
    if not res.data:
        raise NotFoundError("Room not found", code="room_not_found")
    row = res.data[0]
    residents_by_room = _fetch_current_residents(db, [room_id])
    return RoomOut.model_validate(_with_room_details(row, residents_by_room))


def _fetch_rooms_summary(db: Client) -> RoomSummaryOut:
    """Global room-level occupancy breakdown — always unfiltered, independent
    of any list_rooms filter param, same "always global" semantics as
    AllocationList.summary (see app.allocations.service.list_allocations)."""
    rows = rpc_call(db, "hms_rooms_summary", {})
    row = rows[0] if rows else {
        "total_rooms": 0, "occupied_rooms": 0, "available_rooms": 0, "full_rooms": 0,
    }
    return RoomSummaryOut.model_validate(row)


def list_rooms(
    db: Client,
    *,
    page: int,
    per_page: int,
    floor_id: str | None,
    building_id: str | None,
    status: str | None,
    search: str | None,
) -> RoomList:
    eq: dict = {}
    if floor_id:
        eq["floor_id"] = floor_id
    if building_id:
        # PostgREST can filter on an embedded relationship's column directly.
        eq["floors.building_id"] = building_id
    if status:
        eq["status"] = status
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        select=_SELECT,
        eq=eq or None, search=search, search_columns=("room_number",),
        order="room_number", desc=False,
    )
    residents_by_room = _fetch_current_residents(db, [str(i["id"]) for i in items])
    return RoomList(
        items=[RoomOut.model_validate(_with_room_details(i, residents_by_room)) for i in items],
        total=total, page=page, per_page=per_page,
        summary=_fetch_rooms_summary(db),
    )


def update_room(db: Client, room_id: str, data: RoomUpdate) -> RoomOut:
    if get_by_id(db, _TABLE, room_id) is None:
        raise NotFoundError("Room not found", code="room_not_found")
    update(db, _TABLE, room_id, data.model_dump(exclude_unset=True))
    return get_room(db, room_id)


# ── Room detail (bed management) ────────────────────────────────────────────

_ALLOCATION_RESIDENT_SELECT = (
    "id, bed_id, resident_id, allocated_from, "
    "residents(id, first_name, last_name, student_id, program, department, semester, profile_picture_url)"
)


def _fetch_active_allocations_by_bed(db: Client, bed_ids: list[str]) -> dict[str, dict]:
    """Active `room_allocations` rows for the given beds, keyed by `bed_id`.
    A bed can have at most one active allocation (enforced by
    `hms_allocate_bed`), so a plain dict keyed by bed id is safe."""
    if not bed_ids:
        return {}
    res = (
        db.table("room_allocations")
        .select(_ALLOCATION_RESIDENT_SELECT)
        .eq("status", "active")
        .in_("bed_id", bed_ids)
        .execute()
    )
    if getattr(res, "error", None):
        raise_for_error(res, "list room bed allocations")
    return {row["bed_id"]: row for row in (res.data or [])}


def _fetch_check_in_by_allocation(db: Client, allocation_ids: list[str]) -> dict[str, str]:
    """`resident_stays.check_in_at` for allocations with a `checked_in` stay —
    the authoritative check-in date. Allocations without a stay row (not every
    allocation goes through the check-in flow) simply won't appear here; the
    caller falls back to `allocated_from`."""
    if not allocation_ids:
        return {}
    res = (
        db.table("resident_stays")
        .select("allocation_id, check_in_at")
        .eq("status", "checked_in")
        .in_("allocation_id", allocation_ids)
        .execute()
    )
    if getattr(res, "error", None):
        raise_for_error(res, "list room bed stays")
    return {
        row["allocation_id"]: row["check_in_at"]
        for row in (res.data or [])
        if row.get("check_in_at")
    }


def _compute_rent_status(invoice: dict | None, today: date, has_history: bool) -> RentStatusOut:
    if invoice is None:
        # See app.allocations.service._compute_payment_status for why
        # `has_history` (from get_residents_with_any_invoice, scoped by
        # resident_id alone) is what distinguishes a genuinely settled
        # resident — including a returning one whose only invoices are from
        # a prior, now-completed stay — from one who has never been billed.
        if has_history:
            return RentStatusOut(status="paid", label="Paid — Up to date")
        return RentStatusOut(status="no_dues", label="No Dues")

    due_raw = invoice.get("due_date")
    if not due_raw:
        return RentStatusOut(status="pending", label="Pending")

    due = date.fromisoformat(due_raw)
    if due < today:
        days = (today - due).days
        return RentStatusOut(
            status="overdue",
            label=f"Pending — {days} day{'s' if days != 1 else ''} overdue",
            days=days,
        )

    days = (due - today).days
    if days == 0:
        return RentStatusOut(status="pending", label="Due today", days=0)
    return RentStatusOut(status="pending", label=f"Due in {days} day{'s' if days != 1 else ''}", days=days)


def get_room_detail(db: Client, room_id: str) -> RoomDetailOut:
    room = get_room(db, room_id)

    beds_res = (
        db.table("beds").select("*").eq("room_id", room_id).order("bed_number").execute()
    )
    if getattr(beds_res, "error", None):
        raise_for_error(beds_res, "list room beds")
    beds = beds_res.data or []
    bed_ids = [b["id"] for b in beds]

    alloc_by_bed = _fetch_active_allocations_by_bed(db, bed_ids)
    allocation_ids = [a["id"] for a in alloc_by_bed.values()]
    check_in_by_allocation = _fetch_check_in_by_allocation(db, allocation_ids)
    resident_ids = [a["resident_id"] for a in alloc_by_bed.values()]
    invoice_by_resident = get_earliest_outstanding_invoice_by_resident(db, resident_ids)
    billed_resident_ids = get_residents_with_any_invoice(db, resident_ids)

    today = date.today()
    detail_beds: list[RoomDetailBedOut] = []
    occupied_beds = vacant_beds = cleaning_beds = 0

    for bed in beds:
        status = bed["status"]
        if status == "occupied":
            occupied_beds += 1
        elif status == "available":
            vacant_beds += 1
        elif status == "cleaning":
            cleaning_beds += 1

        allocation_id = None
        resident_out = None
        check_in_date = None
        rent_status = None

        alloc = alloc_by_bed.get(bed["id"])
        if alloc:
            allocation_id = alloc["id"]
            resident_row = alloc.get("residents")
            if resident_row:
                resident_out = RoomDetailResidentOut.model_validate(resident_row)

            check_in_raw = check_in_by_allocation.get(alloc["id"])
            if check_in_raw:
                check_in_date = datetime.fromisoformat(check_in_raw).date()
            elif alloc.get("allocated_from"):
                check_in_date = date.fromisoformat(alloc["allocated_from"])

            rent_status = _compute_rent_status(
                invoice_by_resident.get(alloc["resident_id"]), today,
                alloc["resident_id"] in billed_resident_ids,
            )

        detail_beds.append(
            RoomDetailBedOut(
                id=bed["id"],
                bed_number=bed["bed_number"],
                status=status,
                description=bed.get("description"),
                allocation_id=allocation_id,
                resident=resident_out,
                check_in_date=check_in_date,
                rent_status=rent_status,
            )
        )

    summary = RoomDetailSummaryOut(
        total_beds=len(beds),
        occupied_beds=occupied_beds,
        vacant_beds=vacant_beds,
        cleaning_beds=cleaning_beds,
    )
    return RoomDetailOut(room=room, summary=summary, beds=detail_beds)
