"""Report business logic — pure database aggregation, no report tables.

Counts use PostgREST count="exact"; money sums use the aggregate RPC functions
(because PostgREST cannot SUM). All filtering happens in the database.
"""

from __future__ import annotations

from datetime import date

from supabase import Client

from app.database.rpc import rpc_scalar
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


def occupancy(db: Client) -> dict:
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
        "occupancy_rate": round((occupied / beds * 100) if beds else 0, 2),
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
        "overdue_invoices": _counts_by(db, "invoices", "status", "overdue"),
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


def leaves(db: Client) -> dict:
    return {
        "pending": _counts_by(db, "leave_requests", "status", "pending"),
        "approved": _counts_by(db, "leave_requests", "status", "approved"),
        "rejected": _counts_by(db, "leave_requests", "status", "rejected"),
        "completed": _counts_by(db, "leave_requests", "status", "completed"),
        "cancelled": _counts_by(db, "leave_requests", "status", "cancelled"),
    }


def visitors(db: Client) -> dict:
    return {
        "expected": _counts_by(db, "visitors", "status", "expected"),
        "checked_in": _counts_by(db, "visitors", "status", "checked_in"),
        "checked_out": _counts_by(db, "visitors", "status", "checked_out"),
        "cancelled": _counts_by(db, "visitors", "status", "cancelled"),
    }


def maintenance(db: Client) -> dict:
    return {
        "open_tickets": _counts_by(db, "maintenance_tickets", "status", "open"),
        "assigned_tickets": _counts_by(db, "maintenance_tickets", "status", "assigned"),
        "in_progress_tickets": _counts_by(db, "maintenance_tickets", "status", "in_progress"),
        "resolved_tickets": _counts_by(db, "maintenance_tickets", "status", "resolved"),
        "open_complaints": _counts_by(db, "complaints", "status", "open"),
        "resolved_complaints": _counts_by(db, "complaints", "status", "resolved"),
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


def _scalar(value) -> str:
    """Normalize an RPC scalar (int/float/str/Decimal) to a safe string/None."""
    return value if value is not None else 0
