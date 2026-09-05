"""Room allocation business logic.

Allocation, transfer and release are concurrency-critical (a bed is a shared
resource) and touch multiple tables, so they run as transactional database
functions that lock the bed/resident rows. The backend only validates input and
translates the domain errors they raise.
"""

from __future__ import annotations

from datetime import date

from supabase import Client

from app.allocations.schemas import (
    AllocationCreate,
    AllocationList,
    AllocationOut,
    AllocationSummaryOut,
    AllocationTransfer,
    PaymentStatusOut,
)
from app.audit.service import record_audit
from app.common.authz import has_permission
from app.core.exceptions import ForbiddenError
from app.database.crud import list_page
from app.database.rpc import rpc_call
from app.database.supabase import raise_for_error
from app.invoices.service import (
    get_earliest_outstanding_invoice_by_resident,
    get_residents_with_any_invoice,
)
from app.residents.service import get_resident_by_user

_TABLE = "room_allocations"
# Aliased so the embed keys match the schema's singular field names
# (`resident`/`room`/`bed`) — a plain `residents(...)`/`rooms(...)` embed comes
# back keyed by the plural table name and pydantic silently leaves the
# singular fields at their `None` default. `!inner` forces the join so the
# `room.floors.building_id` / `resident.*` filters below actually exclude
# non-matching rows instead of just nulling the embed (room_id/resident_id are
# NOT NULL FKs, so forcing inner never drops a real allocation row).
_SELECT = (
    "*, "
    "bed:beds(id, bed_number), "
    "room:rooms!inner(id, room_number, floors!inner(name, building_id, buildings(name))), "
    "resident:residents!inner(id, first_name, last_name, student_id, profile_picture_url)"
)


def _flatten_room_location(item: dict) -> None:
    """Move the room's embedded `floors`/`buildings` names up onto the room
    dict as `floor_name`/`building_name`, mirroring the same flattening
    app.rooms.service._with_room_details does for the Rooms list."""
    room = item.get("room")
    if not room:
        return
    floors = room.pop("floors", None) or {}
    buildings = floors.get("buildings") or {}
    room["floor_name"] = floors.get("name")
    room["building_name"] = buildings.get("name")

_ERR_MAP = {
    "resident_not_found": (404, "resident_not_found", "Resident not found"),
    "bed_not_found": (404, "bed_not_found", "Bed not found"),
    "bed_occupied": (409, "bed_occupied", "The bed is already occupied"),
    "bed_room_mismatch": (400, "bed_room_mismatch", "The bed does not belong to the given room"),
    "resident_already_allocated": (409, "resident_already_allocated", "Resident already has an active allocation"),
    "admission_required": (400, "admission_required", "An approved admission is required to allocate a bed"),
    "admission_not_approved": (400, "admission_not_approved", "The admission is not approved"),
    "admission_already_used": (409, "admission_already_used", "This admission has already been used for an allocation"),
    "allocation_not_found": (404, "allocation_not_found", "Allocation not found"),
    "allocation_not_active": (409, "allocation_not_active", "The allocation is not active"),
    "same_bed": (400, "same_bed", "The resident is already allocated to this bed"),
}


def create_allocation(db: Client, user: dict, data: AllocationCreate) -> AllocationOut:
    rows = rpc_call(db, "hms_allocate_bed", {
        "p_resident_id": str(data.resident_id),
        "p_room_id": str(data.room_id),
        "p_bed_id": str(data.bed_id),
        "p_admission_id": str(data.admission_id) if data.admission_id else None,
        "p_allocated_from": data.allocated_from.isoformat(),
        "p_allocated_until": data.allocated_until.isoformat() if data.allocated_until else None,
        "p_reason": data.reason,
        "p_allocated_by": user["id"],
    }, _ERR_MAP)
    created = AllocationOut.model_validate(rows[0])
    record_audit(
        db,
        user_id=user["id"],
        action="allocation.create",
        module="room_allocations",
        entity_type="room_allocation",
        entity_id=str(created.id),
        description=f"Allocated bed to resident {created.resident_id}",
    )
    return created


def transfer_allocation(db: Client, user: dict, allocation_id: str, data: AllocationTransfer) -> AllocationOut:
    rows = rpc_call(db, "hms_transfer_allocation", {
        "p_allocation_id": allocation_id,
        "p_new_bed_id": str(data.new_bed_id),
        "p_new_room_id": str(data.new_room_id),
        "p_reason": data.reason,
        "p_transferred_by": user["id"],
    }, _ERR_MAP)
    created = AllocationOut.model_validate(rows[0])
    record_audit(
        db,
        user_id=user["id"],
        action="allocation.transfer",
        module="room_allocations",
        entity_type="room_allocation",
        entity_id=str(created.id),
        description=f"Transferred allocation to bed {created.bed_id}",
    )
    return created


def release_allocation(db: Client, allocation_id: str) -> AllocationOut:
    rows = rpc_call(db, "hms_release_allocation", {"p_allocation_id": allocation_id}, _ERR_MAP)
    released = AllocationOut.model_validate(rows[0])
    record_audit(
        db,
        action="allocation.release",
        module="room_allocations",
        entity_type="room_allocation",
        entity_id=allocation_id,
        description=f"Released allocation {allocation_id}",
    )
    return released


def _compute_payment_status(invoice: dict | None, today: date, has_history: bool) -> PaymentStatusOut:
    if invoice is None:
        # No currently-outstanding invoice. `has_history` (whether this
        # resident has EVER had an invoice, any status, from
        # get_residents_with_any_invoice) is what distinguishes a resident
        # who was billed and settled up (including a returning resident
        # whose only invoices are from a prior, now-completed stay — that
        # query is scoped by resident_id alone, not by allocation/admission
        # cycle, so old settled history still counts here) from one who has
        # never been billed at all.
        if has_history:
            return PaymentStatusOut(status="paid", label="Paid")
        return PaymentStatusOut(status="no_dues", label="No Dues")

    due_raw = invoice.get("due_date")
    if not due_raw:
        return PaymentStatusOut(status="pending", label="Pending")

    due = date.fromisoformat(due_raw)
    if due < today:
        days = (today - due).days
        return PaymentStatusOut(status="overdue", label=f"Overdue {days} day{'s' if days != 1 else ''}", days=days)

    days = (due - today).days
    if days == 0:
        return PaymentStatusOut(status="pending", label="Due today", days=0)
    return PaymentStatusOut(status="pending", label="Pending", days=days)


def _count_beds(db: Client, status: str | None = None) -> int:
    query = db.table("beds").select("id", count="exact")
    if status:
        query = query.eq("status", status)
    res = query.execute()
    if getattr(res, "error", None):
        raise_for_error(res, "count beds")
    return int(res.count or 0)


def _count_pending_payments(db: Client, today: date) -> int:
    """Active allocations whose resident's payment status is genuinely
    pending or overdue — the same computation as each card's payment badge,
    just counted globally. A resident with `no_dues` (never billed) is not a
    pending payment, same as `paid`."""
    res = db.table("room_allocations").select("resident_id").eq("status", "active").execute()
    if getattr(res, "error", None):
        raise_for_error(res, "list active allocations")
    resident_ids = [row["resident_id"] for row in (res.data or [])]
    invoice_by_resident = get_earliest_outstanding_invoice_by_resident(db, resident_ids)
    billed_resident_ids = get_residents_with_any_invoice(db, resident_ids)
    return sum(
        1 for rid in resident_ids
        if _compute_payment_status(invoice_by_resident.get(rid), today, rid in billed_resident_ids).status
        not in ("paid", "no_dues")
    )


def _resolve_search_scope(db: Client, search: str) -> list[str] | None:
    """Resolve a resident-name/student-id/room-number search to actual
    room_allocations columns (resident_id, room_id).

    PostgREST's `or=()` logic tree can only reference plain columns of the
    queried table — it can't reach into an embedded/aliased resource the way
    a lone top-level filter can (that's why the `room.floors.building_id`
    eq filter above works: it's its own query param, not inside an `or=()`
    group). So a search spanning resident.* and room.room_number has to be
    resolved to resident_id/room_id first via two small lookups, then OR'd
    as plain in-list filters on room_allocations itself.

    Returns None if the search matched nothing at all, so the caller can
    short-circuit to an empty page instead of running a pointless query.
    """
    # A resident match has to cover first_name, last_name, AND the
    # concatenated "first last" full name (so "Yasir Maqsood" matches a
    # resident whose first_name is "Yasir" and last_name is "Maqsood") —
    # PostgREST has no filter operator for a computed concatenation, so this
    # is resolved by fetching the (small) resident roster and matching the
    # full name in Python, the same case-insensitive/partial rule ilike gives
    # every other search in this app (e.g. residents.service's own search).
    needle = search.lower()
    residents_res = db.table("residents").select("id, first_name, last_name, student_id").execute()
    if getattr(residents_res, "error", None):
        raise_for_error(residents_res, "search residents")
    resident_ids = []
    for r in residents_res.data or []:
        full_name = f"{r['first_name']} {r.get('last_name') or ''}".strip().lower()
        student_id = (r.get("student_id") or "").lower()
        if needle in full_name or needle in student_id:
            resident_ids.append(r["id"])

    term = f"*{search}*"
    room_res = db.table("rooms").select("id").ilike("room_number", term).execute()
    if getattr(room_res, "error", None):
        raise_for_error(room_res, "search rooms")
    room_ids = [r["id"] for r in (room_res.data or [])]

    if not resident_ids and not room_ids:
        return None

    groups = []
    if resident_ids:
        groups.append(f"resident_id.in.({','.join(resident_ids)})")
    if room_ids:
        groups.append(f"room_id.in.({','.join(room_ids)})")
    return groups


def list_allocations(
    db: Client,
    user: dict,
    *,
    page: int,
    per_page: int,
    resident_id: str | None,
    room_id: str | None,
    building_id: str | None,
    status: str | None,
    active_only: bool,
    search: str | None,
    date_from: date | None,
) -> AllocationList:
    if has_permission(db, user, "allocations.view"):
        scope = str(resident_id) if resident_id else None
    elif has_permission(db, user, "allocations.view_own"):
        own = get_resident_by_user(db, user["id"])
        if own is None:
            raise ForbiddenError("No resident profile linked to this account", code="resident_not_linked")
        scope = str(own["id"])
    else:
        raise ForbiddenError("You cannot view allocations", code="missing_permission")

    eq: dict = {}
    if scope:
        eq["resident_id"] = scope
    if room_id:
        eq["room_id"] = room_id
    if building_id:
        # `room` is the alias given to the `rooms` embed in _SELECT above —
        # PostgREST filters on an embedded relationship must reference it by
        # that alias, not the underlying table name.
        eq["room.floors.building_id"] = building_id
    if status:
        eq["status"] = status
    if active_only:
        eq["status"] = "active"

    search_groups: list[str] = []
    no_search_matches = False
    if search and search.strip():
        resolved = _resolve_search_scope(db, search.strip())
        if resolved is None:
            no_search_matches = True
        else:
            search_groups = resolved

    today = date.today()
    summary = AllocationSummaryOut(
        total_beds=_count_beds(db),
        occupied_beds=_count_beds(db, "occupied"),
        available_beds=_count_beds(db, "available"),
        pending_payments=_count_pending_payments(db, today),
    )

    if no_search_matches:
        return AllocationList(items=[], total=0, page=page, per_page=per_page, summary=summary)

    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        select=_SELECT, eq=eq or None,
        search=search, search_groups=search_groups,
        gte={"allocated_from": date_from.isoformat()} if date_from else None,
        order="allocated_from", desc=True,
    )

    resident_ids = [i["resident_id"] for i in items]
    invoice_by_resident = get_earliest_outstanding_invoice_by_resident(db, resident_ids)
    billed_resident_ids = get_residents_with_any_invoice(db, resident_ids)

    out_items = []
    for i in items:
        _flatten_room_location(i)
        out = AllocationOut.model_validate(i)
        out.payment_status = _compute_payment_status(
            invoice_by_resident.get(i["resident_id"]), today, i["resident_id"] in billed_resident_ids,
        )
        out_items.append(out)

    return AllocationList(items=out_items, total=total, page=page, per_page=per_page, summary=summary)


def get_resident_location(db: Client, resident_id: str) -> tuple[str | None, str | None]:
    """Returns (building_id, floor_id) of a resident's current active
    allocation, or (None, None) if they have none.

    Internal, permission-free — deliberately bypasses list_allocations()'s
    allocations.view/view_own gating, since this resolves someone else's
    location for a system purpose (notices' audience targeting), not the
    caller's own allocations view.
    """
    res = (
        db.table("room_allocations")
        .select("room:rooms!inner(floors!inner(id, building_id))")
        .eq("resident_id", resident_id)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    if not res.data:
        return None, None
    floors = (res.data[0].get("room") or {}).get("floors") or {}
    return floors.get("building_id"), floors.get("id")


def list_resident_ids_by_location(db: Client, *, building_id: str | None = None, floor_id: str | None = None) -> list[str]:
    """Active-allocation resident_ids in a building or floor.

    Internal, permission-free — same rationale as get_resident_location.
    """
    query = (
        db.table("room_allocations")
        .select("resident_id, room:rooms!inner(floors!inner(id, building_id))")
        .eq("status", "active")
    )
    if building_id:
        query = query.eq("room.floors.building_id", building_id)
    if floor_id:
        query = query.eq("room.floors.id", floor_id)
    res = query.execute()
    return [row["resident_id"] for row in (res.data or [])]
