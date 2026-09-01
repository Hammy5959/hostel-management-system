"""Report endpoints (aggregation only — no report tables)."""

from __future__ import annotations

from datetime import date

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
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.occupancy(db)


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
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.leaves(db)


@router.get("/visitors", summary="Visitor report")
def visitors(
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.visitors(db)


@router.get("/maintenance", summary="Maintenance report")
def maintenance(
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.maintenance(db)


@router.get("/inventory", summary="Inventory report")
def inventory(
    _: dict = Depends(require_permission("reports.view")),
    db: Client = Depends(get_db),
) -> dict:
    return service.inventory(db)
