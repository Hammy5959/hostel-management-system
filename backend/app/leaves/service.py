"""Leave request business logic.

Flow: pending -> approved | rejected | cancelled. A resident creates and sees
only their own requests; staff approve/reject.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from supabase import Client

from app.audit.service import record_audit
from app.common.authz import has_permission
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.core.logging import get_logger
from app.database.crud import get_by_id, insert, list_page, update
from app.database.supabase import raise_for_error
from app.leaves.schemas import LeaveCreate, LeaveList, LeaveOut, LeaveReview
from app.notifications.service import notify_resident
from app.residents.service import get_resident_by_user, has_active_allocation, require_own_resident

_TABLE = "leave_requests"
_AUTO_EXCUSE_REMARKS = "Auto-excused: approved leave"

# A leave request only makes sense for a resident currently residing in the hostel.
_ATTENDANCE_ALLOWED_STATUSES = {"active", "on_leave"}


def _fetch(db: Client, leave_id: str) -> dict:
    row = get_by_id(db, _TABLE, leave_id)
    if row is None:
        raise NotFoundError("Leave request not found", code="leave_not_found")
    return row


def _check_no_overlap(db: Client, resident_id: str, start_date: date, end_date: date) -> None:
    """Raise if the resident already has a pending/approved leave overlapping this range.

    Two ranges overlap iff new.start <= existing.end AND new.end >= existing.start.
    An approved leave that was closed out early via mark-returned
    (actual_return_date set) is excluded — the resident already came back,
    so it no longer blocks a new leave in those dates. Mirrors the same
    actual_return_date IS NULL condition hms_apply_leave_status_transitions
    and hms_mark_leave_returned already use.
    """
    res = (
        db.table(_TABLE)
        .select("id", count="exact")
        .eq("resident_id", resident_id)
        .in_("status", ["pending", "approved"])
        .is_("actual_return_date", "null")
        .gte("end_date", start_date.isoformat())
        .lte("start_date", end_date.isoformat())
        .execute()
    )
    if getattr(res, "error", None):
        raise_for_error(res, "check overlapping leave requests")
    if res.count:
        raise ConflictError(
            "This resident already has a pending or approved leave request overlapping these dates",
            code="overlapping_leave",
        )


def create(db: Client, user: dict, data: LeaveCreate) -> LeaveOut:
    resident = get_by_id(db, "residents", str(data.resident_id))
    if resident is None:
        raise NotFoundError("Resident not found", code="resident_not_found")
    # A non-staff actor may only create a request for their own resident profile.
    if not has_permission(db, user, "leave_requests.view"):
        own = get_resident_by_user(db, user["id"])
        if own is None or str(own["id"]) != str(data.resident_id):
            raise ForbiddenError("You can only create leave requests for yourself", code="not_your_resident")
    if resident["status"] not in _ATTENDANCE_ALLOWED_STATUSES:
        raise ConflictError(
            f"Cannot create a leave request for resident with status '{resident['status']}'",
            code="resident_not_active",
        )
    if not has_active_allocation(db, str(data.resident_id)):
        raise ConflictError(
            "Cannot create a leave request for a resident without an active room allocation",
            code="resident_not_allocated",
        )
    _check_no_overlap(db, str(data.resident_id), data.start_date, data.end_date)
    payload = data.model_dump(mode="json")
    payload["status"] = "pending"
    return LeaveOut.model_validate(insert(db, _TABLE, payload))


def list_leaves(
    db: Client,
    user: dict,
    *,
    page: int,
    per_page: int,
    resident_id: str | None,
    status: str | None,
    date_from: date | None,
    date_to: date | None,
) -> LeaveList:
    if has_permission(db, user, "leave_requests.view"):
        scope = str(resident_id) if resident_id else None
    elif has_permission(db, user, "leave_requests.view_own"):
        own = get_resident_by_user(db, user["id"])
        if own is None:
            raise ForbiddenError("No resident profile linked to this account", code="resident_not_linked")
        scope = str(own["id"])
    else:
        raise ForbiddenError("You cannot view leave requests", code="missing_permission")

    eq = {"resident_id": scope} if scope else {}
    if status:
        eq["status"] = status
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        eq=eq or None,
        gte={"start_date": date_from.isoformat()} if date_from else None,
        lte={"start_date": date_to.isoformat()} if date_to else None,
        order="requested_at", desc=True,
    )
    return LeaveList(items=[LeaveOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def _transition(db: Client, leave_id: str, to_status: str, *, reviewer: dict | None, notes: str | None) -> LeaveOut:
    leave = _fetch(db, leave_id)
    if leave["status"] != "pending":
        raise ConflictError(
            f"Cannot transition a leave request from '{leave['status']}'", code="invalid_transition"
        )
    payload: dict = {"status": to_status}
    if reviewer:
        payload["reviewed_by"] = reviewer["id"]
        payload["reviewed_at"] = datetime.now(timezone.utc).isoformat()
        payload["review_notes"] = notes
    return LeaveOut.model_validate(update(db, _TABLE, leave_id, payload))


def _auto_excuse_attendance(db: Client, leave: LeaveOut, approver_id: str) -> None:
    """Mark attendance 'excused' for every date in an approved leave's range.

    Best-effort: must never fail the approval it's attached to.
    """
    try:
        resident_id = str(leave.resident_id)
        current = leave.start_date
        while current <= leave.end_date:
            iso = current.isoformat()
            items, total = list_page(
                db, "attendance", page=1, per_page=1,
                eq={"resident_id": resident_id, "attendance_date": iso},
            )
            if total:
                existing = items[0]
                # Only touch records this same logic previously created — a
                # manually-set status/remarks (e.g. a warden marking the
                # resident "present") must never be overwritten.
                if existing.get("remarks") == _AUTO_EXCUSE_REMARKS:
                    update(db, "attendance", existing["id"], {
                        "status": "excused",
                        "remarks": _AUTO_EXCUSE_REMARKS,
                    })
            else:
                insert(db, "attendance", {
                    "resident_id": resident_id,
                    "attendance_date": iso,
                    "status": "excused",
                    "remarks": _AUTO_EXCUSE_REMARKS,
                    "marked_by": approver_id,
                })
            current += timedelta(days=1)
    except Exception:
        get_logger(__name__).exception("Failed to auto-excuse attendance for leave %s", leave.id)


def approve(db: Client, user: dict, leave_id: str, data: LeaveReview) -> LeaveOut:
    leave = _transition(db, leave_id, "approved", reviewer=user, notes=data.review_notes)
    record_audit(
        db,
        user_id=user["id"],
        action="leave.approve",
        module="leave_requests",
        entity_type="leave_request",
        entity_id=leave_id,
        description=f"Approved leave request for resident {leave.resident_id}",
    )
    notify_resident(
        db,
        str(leave.resident_id),
        title="Leave approved",
        message=f"Your leave request ({leave.start_date} to {leave.end_date}) was approved.",
        reference_type="leave_request",
        reference_id=leave_id,
    )
    _auto_excuse_attendance(db, leave, user["id"])
    return leave


def reject(db: Client, user: dict, leave_id: str, data: LeaveReview) -> LeaveOut:
    leave = _transition(db, leave_id, "rejected", reviewer=user, notes=data.review_notes)
    record_audit(
        db,
        user_id=user["id"],
        action="leave.reject",
        module="leave_requests",
        entity_type="leave_request",
        entity_id=leave_id,
        description=f"Rejected leave request for resident {leave.resident_id}",
    )
    notify_resident(
        db,
        str(leave.resident_id),
        title="Leave request rejected",
        message=f"Your leave request ({leave.start_date} to {leave.end_date}) was not approved.",
        reference_type="leave_request",
        reference_id=leave_id,
    )
    return leave


def cancel(db: Client, user: dict, leave_id: str) -> LeaveOut:
    existing = _fetch(db, leave_id)
    # Staff with leave_requests.approve may cancel any request; everyone else
    # may only cancel their own.
    if not has_permission(db, user, "leave_requests.approve"):
        require_own_resident(db, user, existing["resident_id"])
    leave = _transition(db, leave_id, "cancelled", reviewer=None, notes=None)
    record_audit(
        db,
        user_id=user["id"],
        action="leave.cancel",
        module="leave_requests",
        entity_type="leave_request",
        entity_id=leave_id,
        description=f"Cancelled leave request for resident {leave.resident_id}",
    )
    notify_resident(
        db,
        str(leave.resident_id),
        title="Leave request cancelled",
        message=f"Your leave request ({leave.start_date} to {leave.end_date}) was cancelled.",
        reference_type="leave_request",
        reference_id=leave_id,
    )
    return leave
