"""Report business logic — pure database aggregation, no report tables.

Counts use PostgREST count="exact"; money sums use the aggregate RPC functions
(because PostgREST cannot SUM). All filtering happens in the database.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Literal

from supabase import Client

from app.database.rpc import rpc_call, rpc_scalar
from app.database.supabase import raise_for_error


def _count(db: Client, table: str, *, eq: dict | None = None, gte: dict | None = None, lte: dict | None = None) -> int:
    query = db.table(table).select("id", count="exact")
    for col, val in (eq or {}).items():
        query = query.eq(col, val)
    for col, val in (gte or {}).items():
        if val is not None:
            query = query.gte(col, val)
    for col, val in (lte or {}).items():
        if val is not None:
            query = query.lte(col, val)
    res = query.execute()
    if getattr(res, "error", None):
        raise_for_error(res, f"count {table}")
    return int(res.count or 0)


def _counts_by(db: Client, table: str, column: str, value: str) -> int:
    return _count(db, table, eq={column: value})


def _count_overdue_invoices(db: Client, today: date) -> int:
    """Invoices past due but not yet settled. `invoices.status = 'overdue'`
    is never set by any code path (see app.invoices.service:33-39) — like
    app.allocations.service._compute_payment_status and
    app.rooms.service._compute_rent_status, "overdue" is derived at read
    time: status in ('issued', 'partially_paid') AND due_date has passed.
    `_count()` only supports eq/gte/lte, not in_/lt, hence this one-off
    query."""
    query = (
        db.table("invoices")
        .select("id", count="exact")
        .in_("status", ["issued", "partially_paid"])
        .lt("due_date", today.isoformat())
    )
    res = query.execute()
    if getattr(res, "error", None):
        raise_for_error(res, "count overdue invoices")
    return int(res.count or 0)


def summary(db: Client) -> dict:
    total_beds = _count(db, "beds")
    occupied_beds = _counts_by(db, "beds", "status", "occupied")
    available_beds = _counts_by(db, "beds", "status", "available")
    return {
        "total_residents": _count(db, "residents"),
        "active_residents": _counts_by(db, "residents", "status", "active"),
        "total_beds": total_beds,
        "occupied_beds": occupied_beds,
        "available_beds": available_beds,
        "occupancy_rate": round((occupied_beds / total_beds * 100) if total_beds else 0, 2),
        "pending_admissions": _counts_by(db, "admissions", "status", "pending"),
        "active_allocations": _counts_by(db, "room_allocations", "status", "active"),
        "checked_in_stays": _counts_by(db, "resident_stays", "status", "checked_in"),
        "pending_leaves": _counts_by(db, "leave_requests", "status", "pending"),
        "open_complaints": _count(db, "complaints", eq={"status": "open"}),
        "open_tickets": _count(db, "maintenance_tickets", eq={"status": "open"}),
        "total_payments": _scalar(rpc_scalar(db, "hms_sum_payments")),
        "total_expenses": _scalar(rpc_scalar(db, "hms_sum_expenses")),
        "outstanding_balance": _scalar(rpc_scalar(db, "hms_outstanding_balance")),
    }


_BUILDING_OCCUPANCY_DEFAULTS = {"total_rooms": 0, "total_capacity": 0, "total_beds": 0, "occupied_beds": 0}
_FLOOR_OCCUPANCY_DEFAULTS = {"total_rooms": 0, "total_capacity": 0, "total_beds": 0, "occupied_beds": 0}


def _occupancy_rate(occupied: int, total: int) -> float:
    return round((occupied / total * 100) if total else 0, 2)


def _merge_floor_breakdown(floors: list[dict], stats: dict) -> list[dict]:
    out = []
    for f in floors:
        s = stats.get(f["id"], _FLOOR_OCCUPANCY_DEFAULTS)
        out.append({
            "floor_id": f["id"], "floor_name": f["name"], "building_id": f["building_id"],
            "total_rooms": s["total_rooms"], "total_beds": s["total_beds"], "occupied_beds": s["occupied_beds"],
            "available_beds": s["total_beds"] - s["occupied_beds"],
            "occupancy_rate": _occupancy_rate(s["occupied_beds"], s["total_beds"]),
        })
    return out


def _occupancy_breakdown(db: Client, *, building_id: str | None, floor_id: str | None) -> list[dict]:
    """Per-building or per-floor occupancy rollup. Reuses the existing
    hms_building_occupancy / hms_floor_occupancy RPCs already used by
    app.buildings.service._fetch_occupancy / app.floors.service._fetch_occupancy
    — PostgREST can't GROUP BY across the floors/rooms/beds join in a single
    embedded select, so these RPCs already do the rollup; no new RPC needed
    here.

    - floor_id given: single-floor breakdown (one row).
    - building_id given (no floor_id): per-floor breakdown scoped to that
      building. hms_floor_occupancy only accepts a single p_floor_id, not a
      building_id, so this fetches ALL floors' stats (p_floor_id=None) and
      narrows to the floors belonging to building_id in Python — same
      "fetch all, filter/merge by id" shape as
      app.buildings.service._with_occupancy / app.floors.service._with_occupancy.
    - neither given: per-building breakdown, all buildings.
    """
    if floor_id:
        stats = {r["floor_id"]: r for r in rpc_call(db, "hms_floor_occupancy", {"p_floor_id": floor_id})}
        floors_res = db.table("floors").select("id, name, building_id").eq("id", floor_id).execute()
        if getattr(floors_res, "error", None):
            raise_for_error(floors_res, "list floors")
        return _merge_floor_breakdown(floors_res.data or [], stats)

    if building_id:
        stats = {r["floor_id"]: r for r in rpc_call(db, "hms_floor_occupancy", {"p_floor_id": None})}
        floors_res = db.table("floors").select("id, name, building_id").eq("building_id", building_id).execute()
        if getattr(floors_res, "error", None):
            raise_for_error(floors_res, "list floors")
        return _merge_floor_breakdown(floors_res.data or [], stats)

    stats = {r["building_id"]: r for r in rpc_call(db, "hms_building_occupancy", {"p_building_id": None})}
    buildings_res = db.table("buildings").select("id, name, type").execute()
    if getattr(buildings_res, "error", None):
        raise_for_error(buildings_res, "list buildings")
    out = []
    for b in buildings_res.data or []:
        s = stats.get(b["id"], _BUILDING_OCCUPANCY_DEFAULTS)
        out.append({
            "building_id": b["id"], "building_name": b["name"], "building_type": b.get("type"),
            "total_rooms": s["total_rooms"], "total_beds": s["total_beds"], "occupied_beds": s["occupied_beds"],
            "available_beds": s["total_beds"] - s["occupied_beds"],
            "occupancy_rate": _occupancy_rate(s["occupied_beds"], s["total_beds"]),
        })
    return out


def occupancy(db: Client, *, building_id: str | None = None, floor_id: str | None = None) -> dict:
    beds = _count(db, "beds")
    occupied = _counts_by(db, "beds", "status", "occupied")
    maintenance = _counts_by(db, "beds", "status", "maintenance")
    available = _counts_by(db, "beds", "status", "available")
    cleaning = _counts_by(db, "beds", "status", "cleaning")
    return {
        "total_beds": beds,
        "occupied": occupied,
        "available": available,
        "cleaning": cleaning,
        "maintenance": maintenance,
        "occupancy_rate": _occupancy_rate(occupied, beds),
        "breakdown": _occupancy_breakdown(db, building_id=building_id, floor_id=floor_id),
    }


def admissions(db: Client, date_from: date | None, date_to: date | None) -> dict:
    gte = {"application_date": date_from.isoformat()} if date_from else None
    lte = {"application_date": date_to.isoformat()} if date_to else None
    return {
        "total": _count(db, "admissions", gte=gte, lte=lte),
        "pending": _count(db, "admissions", eq={"status": "pending"}, gte=gte, lte=lte),
        "approved": _count(db, "admissions", eq={"status": "approved"}, gte=gte, lte=lte),
        "rejected": _count(db, "admissions", eq={"status": "rejected"}, gte=gte, lte=lte),
        "cancelled": _count(db, "admissions", eq={"status": "cancelled"}, gte=gte, lte=lte),
    }


def stays(db: Client, date_from: date | None, date_to: date | None) -> dict:
    return {
        "checked_in": _count(
            db, "resident_stays",
            eq={"status": "checked_in"},
            gte={"check_in_at": date_from.isoformat()} if date_from else None,
            lte={"check_in_at": date_to.isoformat()} if date_to else None,
        ),
        "checked_out": _count(
            db, "resident_stays",
            eq={"status": "checked_out"},
            gte={"actual_check_out_at": date_from.isoformat()} if date_from else None,
            lte={"actual_check_out_at": date_to.isoformat()} if date_to else None,
        ),
        "scheduled": _counts_by(db, "resident_stays", "status", "scheduled"),
    }


def finance(db: Client, date_from: date | None, date_to: date | None) -> dict:
    p = {
        "p_from": date_from.isoformat() if date_from else None,
        "p_to": date_to.isoformat() if date_to else None,
    }
    return {
        "total_payments": _scalar(rpc_scalar(db, "hms_sum_payments", p)),
        "total_expenses": _scalar(rpc_scalar(db, "hms_sum_expenses", p)),
        "outstanding_balance": _scalar(rpc_scalar(db, "hms_outstanding_balance")),
        "paid_invoices": _counts_by(db, "invoices", "status", "paid"),
        "overdue_invoices": _count_overdue_invoices(db, date.today()),
        "draft_invoices": _counts_by(db, "invoices", "status", "draft"),
    }


def attendance(db: Client, date_from: date | None, date_to: date | None) -> dict:
    gte = {"attendance_date": date_from.isoformat()} if date_from else None
    lte = {"attendance_date": date_to.isoformat()} if date_to else None
    return {
        "total": _count(db, "attendance", gte=gte, lte=lte),
        "present": _count(db, "attendance", eq={"status": "present"}, gte=gte, lte=lte),
        "absent": _count(db, "attendance", eq={"status": "absent"}, gte=gte, lte=lte),
        "late": _count(db, "attendance", eq={"status": "late"}, gte=gte, lte=lte),
        "excused": _count(db, "attendance", eq={"status": "excused"}, gte=gte, lte=lte),
    }


def leaves(db: Client, date_from: date | None = None, date_to: date | None = None) -> dict:
    """Date filter is on start_date — matches app.leaves.service.list_leaves,
    not requested_at (order-only there)."""
    gte = {"start_date": date_from.isoformat()} if date_from else None
    lte = {"start_date": date_to.isoformat()} if date_to else None
    return {
        "pending": _count(db, "leave_requests", eq={"status": "pending"}, gte=gte, lte=lte),
        "approved": _count(db, "leave_requests", eq={"status": "approved"}, gte=gte, lte=lte),
        "rejected": _count(db, "leave_requests", eq={"status": "rejected"}, gte=gte, lte=lte),
        "completed": _count(db, "leave_requests", eq={"status": "completed"}, gte=gte, lte=lte),
        "cancelled": _count(db, "leave_requests", eq={"status": "cancelled"}, gte=gte, lte=lte),
    }


def visitors(db: Client, date_from: date | None = None, date_to: date | None = None) -> dict:
    """Date filter is on expected_at — matches app.visitors.service.list_visitors
    (that module types date_from/date_to as str; this module stays date-typed
    for consistency with every other reports.service function)."""
    gte = {"expected_at": date_from.isoformat()} if date_from else None
    lte = {"expected_at": date_to.isoformat()} if date_to else None
    return {
        "expected": _count(db, "visitors", eq={"status": "expected"}, gte=gte, lte=lte),
        "checked_in": _count(db, "visitors", eq={"status": "checked_in"}, gte=gte, lte=lte),
        "checked_out": _count(db, "visitors", eq={"status": "checked_out"}, gte=gte, lte=lte),
        "cancelled": _count(db, "visitors", eq={"status": "cancelled"}, gte=gte, lte=lte),
    }


def maintenance(db: Client, date_from: date | None = None, date_to: date | None = None) -> dict:
    """Date filter is on created_at for both tables — neither
    maintenance_tickets nor complaints has any other date-filter precedent
    (created_at is only used for ordering today)."""
    gte = {"created_at": date_from.isoformat()} if date_from else None
    lte = {"created_at": date_to.isoformat()} if date_to else None
    return {
        "open_tickets": _count(db, "maintenance_tickets", eq={"status": "open"}, gte=gte, lte=lte),
        "assigned_tickets": _count(db, "maintenance_tickets", eq={"status": "assigned"}, gte=gte, lte=lte),
        "in_progress_tickets": _count(db, "maintenance_tickets", eq={"status": "in_progress"}, gte=gte, lte=lte),
        "resolved_tickets": _count(db, "maintenance_tickets", eq={"status": "resolved"}, gte=gte, lte=lte),
        "open_complaints": _count(db, "complaints", eq={"status": "open"}, gte=gte, lte=lte),
        "resolved_complaints": _count(db, "complaints", eq={"status": "resolved"}, gte=gte, lte=lte),
    }


def inventory(db: Client) -> dict:
    res = db.table("inventory_items").select("id", "quantity", "minimum_quantity").execute()
    if getattr(res, "error", None):
        raise_for_error(res, "inventory report")
    items = res.data
    return {
        "total_items": len(items),
        "low_stock_items": sum(1 for i in items if i["quantity"] <= i["minimum_quantity"]),
        "out_of_stock_items": sum(1 for i in items if i["quantity"] == 0),
    }


def mess(db: Client, date_from: date | None, date_to: date | None) -> dict:
    """Meal attendance/consumption, from `meals` (not `mess_menus`, which is
    just menu text with no status/attendance concept — see
    app.mess_menus.service, deliberately not touched here, including its
    known update()-name-shadowing recursion bug).

    `not_consumed` counts rows that exist with consumed=False, not residents
    with no row at all for a slot — a resident never marked for a meal is
    "never marked", not "absent" (see app.meals.service.get_register)."""
    gte = {"meal_date": date_from.isoformat()} if date_from else None
    lte = {"meal_date": date_to.isoformat()} if date_to else None
    return {
        "total_records": _count(db, "meals", gte=gte, lte=lte),
        "consumed": _count(db, "meals", eq={"consumed": True}, gte=gte, lte=lte),
        "not_consumed": _count(db, "meals", eq={"consumed": False}, gte=gte, lte=lte),
        "breakfast": _count(db, "meals", eq={"meal_type": "breakfast"}, gte=gte, lte=lte),
        "lunch": _count(db, "meals", eq={"meal_type": "lunch"}, gte=gte, lte=lte),
        "dinner": _count(db, "meals", eq={"meal_type": "dinner"}, gte=gte, lte=lte),
    }


def gate_passes(db: Client, date_from: date | None, date_to: date | None) -> dict:
    """Counts by status. `expired` is a real `gate_pass_status` enum value
    but no application code path currently sets it (verified against
    app.gate_passes.service, whose documented transitions never reach it) —
    included anyway for completeness; it will read 0 until something sets
    it."""
    gte = {"requested_at": date_from.isoformat()} if date_from else None
    lte = {"requested_at": date_to.isoformat()} if date_to else None
    return {
        "total": _count(db, "gate_passes", gte=gte, lte=lte),
        "pending": _count(db, "gate_passes", eq={"status": "pending"}, gte=gte, lte=lte),
        "approved": _count(db, "gate_passes", eq={"status": "approved"}, gte=gte, lte=lte),
        "issued": _count(db, "gate_passes", eq={"status": "issued"}, gte=gte, lte=lte),
        "exited": _count(db, "gate_passes", eq={"status": "exited"}, gte=gte, lte=lte),
        "returned": _count(db, "gate_passes", eq={"status": "returned"}, gte=gte, lte=lte),
        "expired": _count(db, "gate_passes", eq={"status": "expired"}, gte=gte, lte=lte),
        "rejected": _count(db, "gate_passes", eq={"status": "rejected"}, gte=gte, lte=lte),
        "cancelled": _count(db, "gate_passes", eq={"status": "cancelled"}, gte=gte, lte=lte),
    }


def notices(db: Client) -> dict:
    """Published/draft keyed off `is_published` (the current boolean), never
    `published_at IS NOT NULL` — published_at is never cleared on unpublish
    (see app.notices.service.set_published), so it would over-count
    published."""
    return {
        "total": _count(db, "notices"),
        "published": _count(db, "notices", eq={"is_published": True}),
        "draft": _count(db, "notices", eq={"is_published": False}),
        "audience_all": _count(db, "notices", eq={"audience_type": "all"}),
        "audience_building": _count(db, "notices", eq={"audience_type": "building"}),
        "audience_floor": _count(db, "notices", eq={"audience_type": "floor"}),
    }


def trends_collections(
    db: Client, date_from: date | None, date_to: date | None, granularity: Literal["month", "week"],
) -> dict:
    rows = rpc_call(db, "hms_trend_collections", {
        "p_from": date_from.isoformat() if date_from else None,
        "p_to": date_to.isoformat() if date_to else None,
        "p_granularity": granularity,
    })
    return {"granularity": granularity, "items": rows}


def trends_occupancy(
    db: Client, date_from: date | None, date_to: date | None, granularity: Literal["month", "week"],
) -> dict:
    """Occupancy approximated from resident_stays — there's no historical
    bed-status snapshot table in this schema, so this can't reconstruct true
    point-in-time occupancy. hms_trend_occupancy's generate_series needs
    concrete bounds (p_from/p_to are NOT NULL there, unlike
    hms_trend_collections), so an unbounded request defaults to a rolling
    window rather than erroring."""
    today = date.today()
    resolved_to = date_to or today
    resolved_from = date_from or (
        resolved_to - timedelta(weeks=8) if granularity == "week" else resolved_to - timedelta(days=182)
    )
    rows = rpc_call(db, "hms_trend_occupancy", {
        "p_from": resolved_from.isoformat(),
        "p_to": resolved_to.isoformat(),
        "p_granularity": granularity,
    })
    return {
        "granularity": granularity,
        "date_from": resolved_from.isoformat(),
        "date_to": resolved_to.isoformat(),
        "note": (
            "total_beds reflects the current bed count, not a historical "
            "snapshot — this schema has no historical bed-count/status "
            "tracking, so occupancy_rate for past periods is an "
            "approximation against today's bed inventory."
        ),
        "items": rows,
    }


def defaulters(db: Client) -> dict:
    """Per-resident outstanding-balance rollup, via the hms_defaulters() RPC
    (see supabase/migrations/20260915000000_reports_defaulters_function.sql)
    — a resident with at least one overdue invoice, with their total
    outstanding balance across all outstanding invoices, oldest overdue due
    date, and current room/bed if still allocated."""
    rows = rpc_call(db, "hms_defaulters", {})
    return {"items": rows, "total": len(rows)}


def _scalar(value) -> str:
    """Normalize an RPC scalar (int/float/str/Decimal) to a safe string/None."""
    return value if value is not None else 0
