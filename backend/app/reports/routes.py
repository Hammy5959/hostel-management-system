"""Report endpoints (aggregation only — no report tables)."""

from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.reports import service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary", summary="Dashboard summary")
def summary(
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.summary(db)


@router.get("/occupancy", summary="Occupancy report")
def occupancy(
    building_id: str | None = None,
    floor_id: str | None = None,
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.occupancy(db, building_id=building_id, floor_id=floor_id)


@router.get("/admissions", summary="Admissions report")
def admissions(
    date_from: date | None = None,
    date_to: date | None = None,
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.admissions(db, date_from, date_to)


@router.get("/stays", summary="Check-in / check-out report")
def stays(
    date_from: date | None = None,
    date_to: date | None = None,
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.stays(db, date_from, date_to)


@router.get("/finance", summary="Finance report")
def finance(
    date_from: date | None = None,
    date_to: date | None = None,
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.finance(db, date_from, date_to)


@router.get("/attendance", summary="Attendance report")
def attendance(
    date_from: date | None = None,
    date_to: date | None = None,
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.attendance(db, date_from, date_to)


@router.get("/leaves", summary="Leave report")
def leaves(
    date_from: date | None = None,
    date_to: date | None = None,
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.leaves(db, date_from, date_to)


@router.get("/visitors", summary="Visitor report")
def visitors(
    date_from: date | None = None,
    date_to: date | None = None,
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.visitors(db, date_from, date_to)


@router.get("/maintenance", summary="Maintenance report")
def maintenance(
    date_from: date | None = None,
    date_to: date | None = None,
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.maintenance(db, date_from, date_to)


@router.get("/inventory", summary="Inventory report")
def inventory(
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.inventory(db)


@router.get("/mess", summary="Mess/meals report")
def mess(
    date_from: date | None = None,
    date_to: date | None = None,
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.mess(db, date_from, date_to)


@router.get("/gate-passes", summary="Gate passes report")
def gate_passes(
    date_from: date | None = None,
    date_to: date | None = None,
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.gate_passes(db, date_from, date_to)


@router.get("/notices", summary="Notices report")
def notices(
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.notices(db)


@router.get("/defaulters", summary="Defaulters report")
def defaulters(
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.defaulters(db)


@router.get("/trends/collections", summary="Collections trend")
def trends_collections(
    date_from: date | None = None,
    date_to: date | None = None,
    granularity: Literal["month", "week"] = "month",
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.trends_collections(db, date_from, date_to, granularity)


@router.get("/trends/occupancy", summary="Occupancy trend")
def trends_occupancy(
    date_from: date | None = None,
    date_to: date | None = None,
    granularity: Literal["month", "week"] = "month",
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.trends_occupancy(db, date_from, date_to, granularity)
