"""Hostel settings endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.hostel_settings import service
from app.hostel_settings.schemas import HostelSettingsCreate, HostelSettingsOut, HostelSettingsUpdate

router = APIRouter(prefix="/hostel-settings", tags=["hostel-settings"])


@router.get("/current", response_model=HostelSettingsOut, summary="Get active hostel settings")
def get_current(
    _: dict = Depends(require_permission("hostel_settings.view")),
    db: Client = Depends(get_db),
) -> HostelSettingsOut:
    return service.get_current(db)


@router.get("/{settings_id}", response_model=HostelSettingsOut, summary="Get hostel settings by id")
def get_settings(
    settings_id: str,
    _: dict = Depends(require_permission("hostel_settings.view")),
    db: Client = Depends(get_db),
) -> HostelSettingsOut:
    return service.get_settings_by_id(db, settings_id)


@router.post("", response_model=HostelSettingsOut, status_code=201, summary="Create hostel settings")
def create_settings(
    payload: HostelSettingsCreate,
    _: dict = Depends(require_permission("hostel_settings.manage")),
    db: Client = Depends(get_db),
) -> HostelSettingsOut:
    return service.create_settings(db, payload)


@router.patch("/{settings_id}", response_model=HostelSettingsOut, summary="Update hostel settings")
def update_settings(
    settings_id: str,
    payload: HostelSettingsUpdate,
    _: dict = Depends(require_permission("hostel_settings.manage")),
    db: Client = Depends(get_db),
) -> HostelSettingsOut:
    return service.update_settings(db, settings_id, payload)
