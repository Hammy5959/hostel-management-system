"""Notification business logic.

Notifications are user-targeted (e.g. "Leave approved"). Other modules create
them via ``notify()``; a user only ever sees their own.
"""

from __future__ import annotations

from datetime import datetime, timezone

from supabase import Client

from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.logging import get_logger
from app.database.crud import get_by_id, list_page
from app.database.supabase import raise_for_error
from app.notifications.schemas import NotificationCreate, NotificationList, NotificationOut

_TABLE = "notifications"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def notify(
    db: Client,
    *,
    user_id: str,
    title: str,
    message: str,
    type: str = "system",
    priority: str = "normal",
    reference_type: str | None = None,
    reference_id: str | None = None,
) -> NotificationOut | None:
    """Create a notification for a user (used by other modules).

    Best-effort: a failure here (e.g. a transient DB error) is logged and
    swallowed rather than raised, so it never breaks the caller's own action
    (a leave approval, a payment, a notice publish, ...) that triggered it.
    No current caller branches on the return value.
    """
    try:
        row = NotificationCreate(
            user_id=user_id,
            title=title,
            message=message,
            type=type,
            priority=priority,
            reference_type=reference_type,
            reference_id=reference_id,
        )
        return NotificationOut.model_validate(insert(db, _TABLE, row.model_dump(mode="json")))
    except Exception:
        get_logger(__name__).exception("Failed to create notification for user %s", user_id)
        return None


def insert(db: Client, table: str, data: dict) -> dict:
    res = db.table(table).insert(data).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "create notification")
    return res.data[0]


def list_own(
    db: Client,
    user: dict,
    *,
    page: int,
    per_page: int,
    unread_only: bool,
) -> NotificationList:
    eq = {"user_id": user["id"]}
    if unread_only:
        eq["is_read"] = False
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page, eq=eq,
        order="created_at", desc=True,
    )
    return NotificationList(items=[NotificationOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def notify_resident(
    db: Client,
    resident_id: str,
    *,
    title: str,
    message: str,
    reference_type: str | None = None,
    reference_id: str | None = None,
) -> None:
    """Notify the user linked to a resident record, if any."""
    from app.database.crud import get_by_id

    resident = get_by_id(db, "residents", resident_id)
    if resident and resident.get("user_id"):
        notify(
            db,
            user_id=resident["user_id"],
            title=title,
            message=message,
            reference_type=reference_type,
            reference_id=reference_id,
        )


def notify_staff(
    db: Client,
    staff_id: str,
    *,
    title: str,
    message: str,
    reference_type: str | None = None,
    reference_id: str | None = None,
) -> None:
    """Notify the user linked to a staff record, if any. Mirrors
    `notify_resident` exactly, for the staff table."""
    from app.database.crud import get_by_id

    staff = get_by_id(db, "staff", staff_id)
    if staff and staff.get("user_id"):
        notify(
            db,
            user_id=staff["user_id"],
            title=title,
            message=message,
            reference_type=reference_type,
            reference_id=reference_id,
        )


def unread_count(db: Client, user: dict) -> int:
    res = db.table(_TABLE).select("id", count="exact").eq("user_id", user["id"]).eq("is_read", False).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "unread count")
    return int(res.count or 0)


def mark_read(db: Client, user: dict, notification_id: str) -> NotificationOut:
    row = get_by_id(db, _TABLE, notification_id)
    if row is None:
        raise NotFoundError("Notification not found", code="notification_not_found")
    if str(row["user_id"]) != str(user["id"]):
        raise ForbiddenError("This notification does not belong to you", code="not_your_notification")
    res = db.table(_TABLE).update({"is_read": True, "read_at": _now_iso()}).eq("id", notification_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "mark notification read")
    return NotificationOut.model_validate(res.data[0])


def mark_all_read(db: Client, user: dict) -> dict:
    res = db.table(_TABLE).update({"is_read": True, "read_at": _now_iso()}).eq("user_id", user["id"]).eq("is_read", False).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "mark all notifications read")
    return {"detail": "All notifications marked as read"}
