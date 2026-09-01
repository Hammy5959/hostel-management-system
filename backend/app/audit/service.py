"""Audit logging.

Important actions (login, user/staff/role changes, admissions, allocations,
check-in/out, payments, expenses, inventory changes, ...) are recorded here.

SECURITY: OTP values, JWT secrets, service-role keys and passwords are NEVER
logged. ``old_values``/``new_values`` carry only business-relevant fields.
"""

from __future__ import annotations

from typing import Any

from supabase import Client

from app.database.supabase import raise_for_error

_TABLE = "audit_logs"


def record_audit(
    db: Client,
    *,
    user_id: str | None = None,
    action: str,
    module: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    description: str | None = None,
    old_values: dict[str, Any] | None = None,
    new_values: dict[str, Any] | None = None,
) -> None:
    """Write one audit log row. Never raises to the caller — audit must not
    break the primary operation."""
    payload: dict[str, Any] = {
        "user_id": user_id,
        "action": action,
        "module": module,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "description": description,
        "old_values": old_values,
        "new_values": new_values,
    }
    try:
        res = db.table(_TABLE).insert(payload).execute()
        if getattr(res, "error", None):
            raise_for_error(res, "write audit log")
    except Exception:
        # Best-effort: log failures should never fail the parent request.
        from app.core.logging import get_logger

        get_logger(__name__).exception("Failed to write audit log for action=%s", action)
