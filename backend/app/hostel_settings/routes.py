"""Hostel settings endpoints. Singleton — no create, no id-addressed routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from supabase import Client

from app.api.deps import get_db
from app.core.dependencies import get_current_user
from app.core.permissions import require_permission
from app.hostel_settings import service
from app.hostel_settings.schemas import HostelSettingsOut, HostelSettingsUpdate

router = APIRouter(prefix="/hostel-settings", tags=["hostel-settings"])


@router.get("/current", response_model=HostelSettingsOut, summary="Get hostel settings")
def get_current(
    # Any authenticated user, not hostel_settings.view — this backs app-wide
    # branding (topbar/sidebar name+logo) shown to every role, not just
    # hostel_admin. hostel_name/logo_url/timezone/currency are not sensitive.
    _: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> HostelSettingsOut:
    return service.get_current(db)


@router.patch("/current", response_model=HostelSettingsOut, summary="Update hostel settings")
def update_current(
    payload: HostelSettingsUpdate,
    _: dict = Depends(require_permission("hostel_settings.manage")),
    db: Client = Depends(get_db),
) -> HostelSettingsOut:
    return service.update_current(db, payload)
