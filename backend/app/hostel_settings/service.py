"""Hostel settings business logic.

hostel_settings is a singleton table (a `singleton boolean` column carries a
UNIQUE + CHECK constraint at the DB level — see the migration — so it is
physically impossible to hold more than one row). There is no id-addressed
create/get/update: everything reads or writes "the" row directly.
"""

from __future__ import annotations

from datetime import datetime, timezone

from supabase import Client

from app.database.crud import upsert
from app.database.supabase import raise_for_error
from app.hostel_settings.schemas import HostelSettingsOut, HostelSettingsUpdate

_TABLE = "hostel_settings"

_DEFAULTS = {
    "hostel_name": "My Hostel",
    "timezone": "Asia/Karachi",
    "currency": "PKR",
    "singleton": True,
}


def get_current(db: Client) -> HostelSettingsOut:
    """Return the singleton settings row, seeding a default one if the table
    is empty (fresh environment, or the row was somehow deleted). The upsert's
    on_conflict="singleton" makes concurrent first-calls race-safe."""
    res = db.table(_TABLE).select("*").limit(1).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "get hostel settings")
    if res.data:
        return HostelSettingsOut.model_validate(res.data[0])
    rows = upsert(db, _TABLE, _DEFAULTS, on_conflict="singleton")
    return HostelSettingsOut.model_validate(rows[0])


def update_current(db: Client, data: HostelSettingsUpdate) -> HostelSettingsOut:
    payload = data.model_dump(exclude_unset=True)
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = db.table(_TABLE).update(payload).eq("singleton", True).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "update hostel settings")
    if not res.data:
        # No row existed yet — seed the default, then apply the update.
        get_current(db)
        res = db.table(_TABLE).update(payload).eq("singleton", True).execute()
        if getattr(res, "error", None):
            raise_for_error(res, "update hostel settings")
    return HostelSettingsOut.model_validate(res.data[0])
