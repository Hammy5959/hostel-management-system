"""Hostel settings business logic."""

from __future__ import annotations

from supabase import Client

from app.core.exceptions import NotFoundError
from app.database.crud import get_by_id, insert, update
from app.hostel_settings.schemas import HostelSettingsCreate, HostelSettingsOut, HostelSettingsUpdate
from app.database.supabase import raise_for_error

_TABLE = "hostel_settings"


def get_current(db: Client) -> HostelSettingsOut:
    """Return the most recently created settings record (the active one)."""
    res = db.table(_TABLE).select("*").order("created_at", desc=True).limit(1).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "get hostel settings")
    if not res.data:
        raise NotFoundError("Hostel settings not configured", code="hostel_settings_not_found")
    return HostelSettingsOut.model_validate(res.data[0])


def get_settings_by_id(db: Client, settings_id: str) -> HostelSettingsOut:
    row = get_by_id(db, _TABLE, settings_id)
    if row is None:
        raise NotFoundError("Hostel settings not found", code="hostel_settings_not_found")
    return HostelSettingsOut.model_validate(row)


def create_settings(db: Client, data: HostelSettingsCreate) -> HostelSettingsOut:
    return HostelSettingsOut.model_validate(insert(db, _TABLE, data.model_dump(mode="json")))


def update_settings(db: Client, settings_id: str, data: HostelSettingsUpdate) -> HostelSettingsOut:
    if get_by_id(db, _TABLE, settings_id) is None:
        raise NotFoundError("Hostel settings not found", code="hostel_settings_not_found")
    return HostelSettingsOut.model_validate(update(db, _TABLE, settings_id, data.model_dump(exclude_unset=True)))
