"""Attendance business logic.

One record per (resident, attendance_date) — the database UNIQUE constraint
enforces this, so a duplicate mark surfaces as a 409.
"""

from __future__ import annotations

from supabase import Client

from app.attendance.schemas import (
    AttendanceBulkMark,
    AttendanceBulkResult,
    AttendanceBulkSkipped,
    AttendanceList,
    AttendanceMark,
    AttendanceOut,
    AttendanceUpdate,
)
from app.audit.service import record_audit
from app.common.authz import has_permission
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.residents.service import RESIDING_STATUSES, get_resident_by_user, has_active_allocation

_TABLE = "attendance"


def _existing_record(db: Client, resident_id: str, attendance_date: str) -> dict | None:
    items, total = list_page(
        db, _TABLE, page=1, per_page=1,
        eq={"resident_id": resident_id, "attendance_date": attendance_date},
    )
    return items[0] if total else None


def mark(db: Client, user: dict, data: AttendanceMark) -> AttendanceOut:
    resident = get_by_id(db, "residents", str(data.resident_id))
    if resident is None:
        raise NotFoundError("Resident not found", code="resident_not_found")
    if resident["status"] not in RESIDING_STATUSES:
        raise ConflictError(
            f"Cannot mark attendance for resident with status '{resident['status']}'",
            code="resident_not_active",
        )
    if not has_active_allocation(db, str(data.resident_id)):
        raise ConflictError(
            "Cannot mark attendance for a resident without an active room allocation",
            code="resident_not_allocated",
        )
    if _existing_record(db, str(data.resident_id), data.attendance_date.isoformat()) is not None:
        raise ConflictError(
            f"Attendance for resident {data.resident_id} on {data.attendance_date} is already marked",
            code="attendance_already_marked",
        )
    payload = data.model_dump(mode="json")
    payload["marked_by"] = user["id"]
    return AttendanceOut.model_validate(insert(db, _TABLE, payload))


def bulk_mark(db: Client, user: dict, data: AttendanceBulkMark) -> AttendanceBulkResult:
    for record in data.records:
        resident = get_by_id(db, "residents", str(record.resident_id))
        if resident is None:
            raise NotFoundError(f"Resident {record.resident_id} not found", code="resident_not_found")
        if resident["status"] not in RESIDING_STATUSES:
            raise ConflictError(
                f"Cannot mark attendance for resident {record.resident_id} with status '{resident['status']}'",
                code="resident_not_active",
            )
        if not has_active_allocation(db, str(record.resident_id)):
            raise ConflictError(
                f"Cannot mark attendance for resident {record.resident_id} without an active room allocation",
                code="resident_not_allocated",
            )

    created: list[AttendanceOut] = []
    skipped: list[AttendanceBulkSkipped] = []
    for record in data.records:
        if _existing_record(db, str(record.resident_id), record.attendance_date.isoformat()) is not None:
            skipped.append(
                AttendanceBulkSkipped(
                    resident_id=record.resident_id,
                    attendance_date=record.attendance_date,
                    reason="already_marked",
                )
            )
            continue
        payload = record.model_dump(mode="json")
        payload["marked_by"] = user["id"]
        created.append(AttendanceOut.model_validate(insert(db, _TABLE, payload)))

    record_audit(
        db,
        user_id=user["id"],
        action="attendance.bulk_mark",
        module="attendance",
        entity_type="attendance",
        description=f"Bulk marked attendance: {len(created)} created, {len(skipped)} skipped",
    )
    return AttendanceBulkResult(
        created=created,
        skipped=skipped,
        created_count=len(created),
        skipped_count=len(skipped),
    )


def update_attendance(db: Client, record_id: str, data: AttendanceUpdate) -> AttendanceOut:
    if get_by_id(db, _TABLE, record_id) is None:
        raise NotFoundError("Attendance record not found", code="attendance_not_found")
    return AttendanceOut.model_validate(update(db, _TABLE, record_id, data.model_dump(exclude_unset=True)))


def list_attendance(
    db: Client,
    user: dict,
    *,
    page: int,
    per_page: int,
    resident_id: str | None,
    date_from: date | None,
    date_to: date | None,
    status: str | None,
) -> AttendanceList:
    if has_permission(db, user, "attendance.view"):
        scope = str(resident_id) if resident_id else None
    elif has_permission(db, user, "attendance.view_own"):
        own = get_resident_by_user(db, user["id"])
        if own is None:
            raise ForbiddenError("No resident profile linked to this account", code="resident_not_linked")
        scope = str(own["id"])
    else:
        raise ForbiddenError("You cannot view attendance", code="missing_permission")

    eq = {"resident_id": scope} if scope else {}
    if status:
        eq["status"] = status
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        eq=eq or None,
        gte={"attendance_date": date_from.isoformat()} if date_from else None,
        lte={"attendance_date": date_to.isoformat()} if date_to else None,
        order="attendance_date", desc=True,
    )
    return AttendanceList(items=[AttendanceOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)
