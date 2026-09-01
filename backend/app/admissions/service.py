"""Admission business logic.

Lifecycle: pending -> approved | rejected | cancelled. Approved admissions make
a resident eligible for room allocation. Only the authorized staff actions may
move an admission, and only out of the pending state.
"""

from __future__ import annotations

from datetime import datetime, timezone

from supabase import Client

from app.admissions.schemas import AdmissionCreate, AdmissionList, AdmissionOut, AdmissionUpdate
from app.audit.service import record_audit
from app.common.authz import has_permission
from app.common.numbers import generate_number
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.notifications.service import notify_resident
from app.residents.service import get_resident_by_user, set_resident_status

_TABLE = "admissions"
_SELECT = "*, resident:residents(id, first_name, last_name, student_id, profile_picture_url, program, semester, institution)"


def _fetch(db: Client, admission_id: str) -> dict:
    row = get_by_id(db, _TABLE, admission_id)
    if row is None:
        raise NotFoundError("Admission not found", code="admission_not_found")
    return row


def create_admission(db: Client, user: dict, data: AdmissionCreate) -> AdmissionOut:
    resident_id = str(data.resident_id)
    resident = get_by_id(db, "residents", resident_id)
    if resident is None:
        raise NotFoundError("Resident not found", code="resident_not_found")
    if resident["status"] in ("active", "on_leave"):
        raise ConflictError("This resident is already admitted", code="resident_already_admitted")
    pending, _ = list_page(db, _TABLE, page=1, per_page=1, eq={"resident_id": resident_id, "status": "pending"})
    if pending:
        raise ConflictError("This resident already has a pending admission", code="admission_already_pending")
    payload = data.model_dump(mode="json")
    payload["admission_number"] = payload.get("admission_number") or generate_number("ADM")
    payload["status"] = "pending"
    payload["created_by"] = user["id"]
    return AdmissionOut.model_validate(insert(db, _TABLE, payload))


def get_admission(db: Client, admission_id: str) -> AdmissionOut:
    return AdmissionOut.model_validate(_fetch(db, admission_id))


def list_admissions(
    db: Client,
    user: dict,
    *,
    page: int,
    per_page: int,
    resident_id: str | None,
    status: str | None,
    search: str | None,
    available_for_allocation: bool = False,
) -> AdmissionList:
    if has_permission(db, user, "admissions.view"):
        scope = str(resident_id) if resident_id else None
    elif has_permission(db, user, "admissions.view_own"):
        own = get_resident_by_user(db, user["id"])
        if own is None:
            raise ForbiddenError("No resident profile linked to this account", code="resident_not_linked")
        scope = str(own["id"])
    else:
        raise ForbiddenError("You cannot view admissions", code="missing_permission")

    eq: dict = {}
    not_in: dict = {}
    if scope:
        eq["resident_id"] = scope
    if status:
        eq["status"] = status
    if available_for_allocation:
        # An admission is consumed by its first allocation for good — see
        # app.allocations.service.create_allocation (hms_allocate_bed's
        # admission_already_used check) for the same rule enforced
        # server-side on create.
        used = db.table("room_allocations").select("admission_id").execute()
        if getattr(used, "error", None):
            from app.database.supabase import raise_for_error
            raise_for_error(used, "list allocation admission links")
        used_ids = [row["admission_id"] for row in used.data if row.get("admission_id")]
        if used_ids:
            not_in["id"] = used_ids
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        select=_SELECT, eq=eq or None, not_in=not_in or None, search=search, search_columns=("admission_number",),
        order="application_date", desc=True,
    )
    return AdmissionList(items=[AdmissionOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def update_admission(db: Client, admission_id: str, data: AdmissionUpdate) -> AdmissionOut:
    _fetch(db, admission_id)
    return AdmissionOut.model_validate(update(db, _TABLE, admission_id, data.model_dump(exclude_unset=True)))


def _transition(db: Client, admission_id: str, to_status: str, *, actor_key: str | None, actor_id: str | None, ts_col: str | None) -> AdmissionOut:
    admission = _fetch(db, admission_id)
    if admission["status"] != "pending":
        raise ConflictError(
            f"Cannot transition an admission from '{admission['status']}'", code="invalid_transition"
        )
    now_iso = datetime.now(timezone.utc).isoformat()
    payload: dict = {"status": to_status}
    if actor_key and actor_id:
        payload[actor_key] = actor_id
    if ts_col:
        payload[ts_col] = now_iso
    return AdmissionOut.model_validate(update(db, _TABLE, admission_id, payload))


def approve_admission(db: Client, user: dict, admission_id: str) -> AdmissionOut:
    admission = _transition(db, admission_id, "approved", actor_key="approved_by", actor_id=user["id"], ts_col="approved_at")
    set_resident_status(db, str(admission.resident_id), "active")
    record_audit(
        db,
        user_id=user["id"],
        action="admission.approve",
        module="admissions",
        entity_type="admission",
        entity_id=admission_id,
        description=f"Approved admission {admission.admission_number}",
    )
    notify_resident(
        db,
        str(admission.resident_id),
        title="Admission approved",
        message=f"Your admission ({admission.admission_number}) has been approved.",
        reference_type="admission",
        reference_id=admission_id,
    )
    return admission


def reject_admission(db: Client, user: dict, admission_id: str, notes: str | None = None) -> AdmissionOut:
    admission = _transition(db, admission_id, "rejected", actor_key=None, actor_id=None, ts_col="rejected_at")
    set_resident_status(db, str(admission.resident_id), "inactive")
    if notes:
        admission = AdmissionOut.model_validate(update(db, _TABLE, admission_id, {"notes": notes}))
    record_audit(
        db,
        user_id=user["id"],
        action="admission.reject",
        module="admissions",
        entity_type="admission",
        entity_id=admission_id,
        description=f"Rejected admission {admission.admission_number}",
    )
    notify_resident(
        db,
        str(admission.resident_id),
        title="Admission rejected",
        message=f"Your admission ({admission.admission_number}) was not approved.",
        reference_type="admission",
        reference_id=admission_id,
    )
    return admission


def cancel_admission(db: Client, admission_id: str) -> AdmissionOut:
    admission = _transition(db, admission_id, "cancelled", actor_key=None, actor_id=None, ts_col=None)
    record_audit(
        db,
        action="admission.cancel",
        module="admissions",
        entity_type="admission",
        entity_id=admission_id,
        description=f"Cancelled admission {admission.admission_number}",
    )
    return admission
