"""Resident business logic.

Ownership rule: a resident user may only ever access the resident record whose
``user_id`` equals their own user id. Staff with residents.view/update manage
any record. Changing an id never crosses the ownership boundary.
"""

from __future__ import annotations

from supabase import Client

from app.audit.service import record_audit
from app.core.exceptions import ForbiddenError, NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.database.rpc import rpc_call
from app.notifications.service import notify_resident
from app.residents.schemas import (
    ResidentCheckoutInput,
    ResidentCreate,
    ResidentList,
    ResidentOut,
    ResidentSummaryOut,
    ResidentUpdate,
)
from app.users.crud import get_user_by_id

_TABLE = "residents"
_SELECT = "*, users(id, email, status)"


def _fetch(db: Client, resident_id: str) -> dict:
    row = get_by_id(db, _TABLE, resident_id)
    if row is None:
        raise NotFoundError("Resident not found", code="resident_not_found")
    return row


def create_resident(db: Client, data: ResidentCreate) -> ResidentOut:
    payload = data.model_dump(mode="json")
    if payload.get("user_id"):
        if get_user_by_id(db, payload["user_id"]) is None:
            raise NotFoundError("User not found", code="user_not_found")
    return ResidentOut.model_validate(insert(db, _TABLE, payload))


def get_resident(db: Client, resident_id: str) -> ResidentOut:
    return ResidentOut.model_validate(_fetch(db, resident_id))


def get_resident_by_user(db: Client, user_id: str) -> dict | None:
    res = db.table(_TABLE).select(_SELECT).eq("user_id", user_id).execute()
    if getattr(res, "error", None):
        from app.database.supabase import raise_for_error
        raise_for_error(res, "get resident by user")
    return res.data[0] if res.data else None


def has_active_allocation(db: Client, resident_id: str) -> bool:
    """Whether a resident currently holds an active room allocation.

    Used by app.attendance.service (mark/bulk_mark) and app.leaves.service
    (create) as the "resident_not_allocated" guard — a resident's status can
    be "active" without a bed yet (see list_residents' eligible_for_attendance
    for why), so status alone isn't a reliable signal that they're actually
    residing.
    """
    res = db.table("room_allocations").select("id").eq("resident_id", resident_id).eq("status", "active").execute()
    if getattr(res, "error", None):
        from app.database.supabase import raise_for_error
        raise_for_error(res, "check active allocation")
    return bool(res.data)


def list_institutions(db: Client) -> list[str]:
    res = db.table(_TABLE).select("institution").execute()
    if getattr(res, "error", None):
        from app.database.supabase import raise_for_error
        raise_for_error(res, "list resident institutions")
    values = {row["institution"] for row in res.data if row.get("institution")}
    return sorted(values)


def _fetch_residents_summary(db: Client) -> ResidentSummaryOut:
    """Global resident status breakdown — always unfiltered, independent of
    any list_residents filter param (status/institution/search/
    eligible_for_*), same "always global" semantics as AllocationList.summary
    (see app.allocations.service.list_allocations). Plain PostgREST counts
    per status value, re-implemented locally rather than importing
    reports/service.py's private `_counts_by` — each module owns its own
    logic, e.g. app.allocations.service's own local `_count_beds`."""
    from app.database.supabase import raise_for_error

    def _count(status: str | None = None) -> int:
        query = db.table(_TABLE).select("id", count="exact")
        if status:
            query = query.eq("status", status)
        res = query.execute()
        if getattr(res, "error", None):
            raise_for_error(res, "count residents")
        return int(res.count or 0)

    return ResidentSummaryOut(
        total=_count(),
        active=_count("active"),
        on_leave=_count("on_leave"),
        applicant=_count("applicant"),
    )


def list_residents(
    db: Client,
    *,
    page: int,
    per_page: int,
    search: str | None,
    status: str | None,
    institution: str | None,
    eligible_for_admission: bool = False,
    eligible_for_allocation: bool = False,
    eligible_for_attendance: bool = False,
    eligible_for_billing: bool = False,
    eligible_for_payment: bool = False,
    eligible_for_visitor: bool = False,
) -> ResidentList:
    summary = _fetch_residents_summary(db)
    eq: dict = {}
    not_in: dict = {}
    in_: dict = {}
    if status:
        eq["status"] = status
    if institution:
        eq["institution"] = institution
    if eligible_for_admission:
        # A resident already living in the hostel, or one with an admission
        # awaiting a decision, cannot receive another admission — see
        # admissions.service.create_admission for the same rule enforced
        # server-side on create.
        not_in["status"] = ["active", "on_leave"]
        pending = db.table("admissions").select("resident_id").eq("status", "pending").execute()
        if getattr(pending, "error", None):
            from app.database.supabase import raise_for_error
            raise_for_error(pending, "list pending admissions")
        pending_ids = [row["resident_id"] for row in pending.data]
        if pending_ids:
            not_in["id"] = pending_ids
    if eligible_for_attendance:
        # A resident can only have attendance marked or a leave request created
        # while they're currently residing — see app.attendance.service.mark /
        # bulk_mark and app.leaves.service.create's "resident_not_active" guard
        # for the same status rule enforced server-side on create. Status alone
        # isn't reliable, though: admissions.approve_admission sets a resident
        # "active" immediately on admission approval, before any bed is
        # allocated (allocation is a separate, later step), so an approved
        # resident can be active with no allocation for a while. The presence
        # of an active room_allocation is the real gate — see the
        # "resident_not_allocated" guard those same functions enforce.
        from app.database.supabase import raise_for_error

        in_["status"] = ["active", "on_leave"]
        active_alloc = db.table("room_allocations").select("resident_id").eq("status", "active").execute()
        if getattr(active_alloc, "error", None):
            raise_for_error(active_alloc, "list active allocations")
        allocated_ids = {row["resident_id"] for row in active_alloc.data}
        if not allocated_ids:
            return ResidentList(items=[], total=0, page=page, per_page=per_page, summary=summary)
        in_["id"] = list(allocated_ids)
    if eligible_for_billing:
        # A resident can only be charged or invoiced while they hold an active
        # room allocation — see app.resident_charges.service.create and
        # app.invoices.service.create_invoice's "resident_not_allocated" guard
        # for the same rule enforced server-side on create.
        from app.database.supabase import raise_for_error

        in_["status"] = ["active", "on_leave"]
        active_alloc = db.table("room_allocations").select("resident_id").eq("status", "active").execute()
        if getattr(active_alloc, "error", None):
            raise_for_error(active_alloc, "list active allocations")
        allocated_ids = {row["resident_id"] for row in active_alloc.data}
        if not allocated_ids:
            return ResidentList(items=[], total=0, page=page, per_page=per_page, summary=summary)
        in_["id"] = list(allocated_ids)
    if eligible_for_payment:
        # A payment is only ever recorded against an existing, still-payable
        # invoice — so the payment resident picker doesn't gate on allocation
        # (a resident who's since checked out must stay payable against a real
        # outstanding invoice), it gates on actually having one. See
        # app.payments.service.record_payment (delegates to hms_record_payment,
        # which already validates the invoice itself).
        from app.database.supabase import raise_for_error

        payable = db.table("invoices").select("resident_id").in_(
            "status", ["issued", "partially_paid", "overdue"]
        ).execute()
        if getattr(payable, "error", None):
            raise_for_error(payable, "list payable invoices")
        payable_ids = {row["resident_id"] for row in payable.data}
        if not payable_ids:
            return ResidentList(items=[], total=0, page=page, per_page=per_page, summary=summary)
        in_["id"] = list(payable_ids)
    if eligible_for_allocation:
        # A resident can be allocated only if they have an approved admission
        # that hasn't already been used by a prior allocation, and they don't
        # already have an active allocation — see
        # app.allocations.service.create_allocation (hms_allocate_bed's
        # "admission_required"/"admission_not_approved"/"admission_already_used"/
        # "resident_already_allocated" checks) for the same rules enforced
        # server-side on create.
        from app.database.supabase import raise_for_error

        approved = db.table("admissions").select("id, resident_id").eq("status", "approved").execute()
        if getattr(approved, "error", None):
            raise_for_error(approved, "list approved admissions")
        used = db.table("room_allocations").select("admission_id").execute()
        if getattr(used, "error", None):
            raise_for_error(used, "list allocation admission links")
        used_admission_ids = {row["admission_id"] for row in used.data if row.get("admission_id")}
        unused_approved_resident_ids = {
            row["resident_id"] for row in approved.data if row["id"] not in used_admission_ids
        }

        active = db.table("room_allocations").select("resident_id").eq("status", "active").execute()
        if getattr(active, "error", None):
            raise_for_error(active, "list active allocations")
        active_ids = {row["resident_id"] for row in active.data}

        eligible_ids = unused_approved_resident_ids - active_ids
        if not eligible_ids:
            return ResidentList(items=[], total=0, page=page, per_page=per_page, summary=summary)
        in_["id"] = list(eligible_ids)
    if eligible_for_visitor:
        # A resident can only receive a registered guest while they still
        # actually live here — see app.visitors.service.create_visitor's
        # "resident_not_active" guard for the same rule enforced server-side
        # on create. on_leave stays eligible (temporary, bed still allocated).
        not_in["status"] = ["checked_out"]
    # "first_name"/"last_name" are separate columns, so a plain per-column ILIKE
    # never matches a full "First Last" query. Split on whitespace and also
    # match first_name/last_name pairwise (either order) so full-name search works.
    search_groups: list[str] = []
    words = search.split() if search else []
    if len(words) > 1:
        head, rest = words[0], " ".join(words[1:])
        search_groups = [
            f"and(first_name.ilike.*{head}*,last_name.ilike.*{rest}*)",
            f"and(first_name.ilike.*{rest}*,last_name.ilike.*{head}*)",
        ]
    items, total = list_page(
        db, _TABLE,
        page=page, per_page=per_page,
        select=_SELECT, eq=eq or None, in_=in_ or None, not_in=not_in or None,
        search=search, search_columns=("first_name", "last_name", "student_id", "email", "phone"),
        search_groups=search_groups,
        order="created_at", desc=True,
    )
    return ResidentList(
        items=[ResidentOut.model_validate(i) for i in items],
        total=total, page=page, per_page=per_page, summary=summary,
    )


def update_resident(db: Client, resident_id: str, data: ResidentUpdate) -> ResidentOut:
    _fetch(db, resident_id)
    payload = data.model_dump(mode="json", exclude_unset=True)
    if payload.get("user_id") and get_user_by_id(db, payload["user_id"]) is None:
        raise NotFoundError("User not found", code="user_not_found")
    return ResidentOut.model_validate(update(db, _TABLE, resident_id, payload))


def get_own_resident(db: Client, user: dict) -> ResidentOut:
    """Return the resident record linked to the authenticated user."""
    row = get_resident_by_user(db, user["id"])
    if row is None:
        raise NotFoundError("No resident profile linked to this account", code="resident_not_linked")
    return ResidentOut.model_validate(row)


def update_own_resident(db: Client, user: dict, data: ResidentUpdate) -> ResidentOut:
    row = get_resident_by_user(db, user["id"])
    if row is None:
        raise NotFoundError("No resident profile linked to this account", code="resident_not_linked")
    payload = data.model_dump(mode="json", exclude_unset=True)
    # A resident cannot reassign their own user link. Status isn't on
    # ResidentUpdate at all (see set_resident_status), so no separate pop
    # is needed for it.
    payload.pop("user_id", None)
    return ResidentOut.model_validate(update(db, _TABLE, row["id"], payload))


def require_own_resident(db: Client, user: dict, resident_id: str) -> None:
    """Raise 403 unless the given resident belongs to the authenticated user."""
    row = get_resident_by_user(db, user["id"])
    if row is None or str(row["id"]) != str(resident_id):
        raise ForbiddenError("Access to this resident is not allowed", code="not_your_resident")


def set_resident_status(db: Client, resident_id: str, status: str) -> ResidentOut:
    """Internal-only status write, used by other services that own a specific
    transition (admissions.approve_admission -> active,
    admissions.reject_admission -> inactive). Never exposed on the public
    ResidentUpdate schema/PATCH endpoint — status may only change through a
    flow that owns its own transition rules, not a raw field edit."""
    return ResidentOut.model_validate(update(db, _TABLE, resident_id, {"status": status}))


_CHECKOUT_ERR_MAP = {
    "resident_not_found": (404, "resident_not_found", "Resident not found"),
    "resident_not_checkoutable": (
        409, "resident_not_checkoutable", "Only active or on-leave residents can be checked out",
    ),
    "no_active_allocation": (
        409, "no_active_allocation", "This resident has no active room allocation to release",
    ),
}


def checkout_resident(db: Client, user: dict, resident_id: str, data: ResidentCheckoutInput) -> ResidentOut:
    """Atomically release the resident's active room allocation, free the
    bed, and mark them checked_out — see hms_checkout_resident for the
    locking transaction this delegates to."""
    rows = rpc_call(db, "hms_checkout_resident", {
        "p_resident_id": resident_id,
        "p_reason": data.reason,
    }, _CHECKOUT_ERR_MAP)
    resident = ResidentOut.model_validate(rows[0])
    record_audit(
        db,
        user_id=user["id"],
        action="resident.checkout",
        module="residents",
        entity_type="resident",
        entity_id=resident_id,
        description=f"Checked out resident {resident_id}",
    )
    notify_resident(
        db,
        resident_id,
        title="Checked out",
        message="You have been checked out and your room allocation has been released.",
        reference_type="resident",
        reference_id=resident_id,
    )
    return resident


_MARK_RETURNED_ERR_MAP = {
    "resident_not_found": (404, "resident_not_found", "Resident not found"),
    "resident_not_on_leave": (
        409, "resident_not_on_leave", "Only a resident currently on leave can be marked returned",
    ),
    "no_covering_leave": (
        409, "no_covering_leave", "No approved leave currently covers today for this resident",
    ),
}


def mark_returned(db: Client, user: dict, resident_id: str) -> ResidentOut:
    """Manually flip an on_leave resident back to active before their
    approved leave's end_date — see hms_mark_leave_returned for the locking
    transaction this delegates to and how it stops the scheduled
    active<->on_leave job from re-flipping them."""
    rows = rpc_call(db, "hms_mark_leave_returned", {
        "p_resident_id": resident_id,
        "p_marked_by": user["id"],
    }, _MARK_RETURNED_ERR_MAP)
    resident = ResidentOut.model_validate(rows[0])
    record_audit(
        db,
        user_id=user["id"],
        action="resident.mark_returned",
        module="residents",
        entity_type="resident",
        entity_id=resident_id,
        description=f"Marked resident {resident_id} as returned from leave",
    )
    notify_resident(
        db,
        resident_id,
        title="Marked as returned",
        message="You have been marked as returned from leave.",
        reference_type="resident",
        reference_id=resident_id,
    )
    return resident
