"""Gate pass business logic.

Lifecycle:
  pending -> approved -> issued -> exited -> returned
  pending -> rejected
  pending | approved -> cancelled
Each transition validates the current state.
"""

from __future__ import annotations

from datetime import datetime, timezone

from supabase import Client

from app.common.authz import has_permission
from app.common.numbers import generate_number
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.gate_passes.schemas import GatePassAction, GatePassCreate, GatePassList, GatePassOut
from app.residents.service import get_resident_by_user

_TABLE = "gate_passes"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fetch(db: Client, pass_id: str) -> dict:
    row = get_by_id(db, _TABLE, pass_id)
    if row is None:
        raise NotFoundError("Gate pass not found", code="gate_pass_not_found")
    return row


def _require_state(row: dict, expected: str) -> None:
    if row["status"] != expected:
        raise ConflictError(
            f"Cannot perform this action on a gate pass in '{row['status']}' state", code="invalid_transition"
        )


def create(db: Client, user: dict, data: GatePassCreate) -> GatePassOut:
    if get_by_id(db, "residents", str(data.resident_id)) is None:
        raise NotFoundError("Resident not found", code="resident_not_found")
    # Residents create passes for themselves; staff with view may create for any resident.
    if not has_permission(db, user, "gate_passes.view"):
        own = get_resident_by_user(db, user["id"])
        if own is None or str(own["id"]) != str(data.resident_id):
            raise ForbiddenError("You can only request gate passes for yourself", code="not_your_resident")
    payload = data.model_dump(mode="json")
    payload["pass_number"] = generate_number("GP")
    payload["status"] = "pending"
    return GatePassOut.model_validate(insert(db, _TABLE, payload))


def list_passes(
    db: Client,
    user: dict,
    *,
    page: int,
    per_page: int,
    resident_id: str | None,
    status: str | None,
) -> GatePassList:
    if has_permission(db, user, "gate_passes.view"):
        scope = str(resident_id) if resident_id else None
    elif has_permission(db, user, "gate_passes.view_own"):
        own = get_resident_by_user(db, user["id"])
        if own is None:
            raise ForbiddenError("No resident profile linked to this account", code="resident_not_linked")
        scope = str(own["id"])
    else:
        raise ForbiddenError("You cannot view gate passes", code="missing_permission")

    eq = {"resident_id": scope} if scope else {}
    if status:
        eq["status"] = status
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        eq=eq or None, order="requested_at", desc=True,
    )
    return GatePassList(items=[GatePassOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def approve(db: Client, user: dict, pass_id: str) -> GatePassOut:
    row = _fetch(db, pass_id)
    _require_state(row, "pending")
    return GatePassOut.model_validate(update(db, _TABLE, pass_id, {"status": "approved", "approved_by": user["id"], "approved_at": _now_iso()}))


def reject(db: Client, user: dict, pass_id: str, data: GatePassAction) -> GatePassOut:
    row = _fetch(db, pass_id)
    _require_state(row, "pending")
    payload = {"status": "rejected", "approved_by": user["id"], "approved_at": _now_iso()}
    if data.notes:
        payload["notes"] = data.notes
    return GatePassOut.model_validate(update(db, _TABLE, pass_id, payload))


def issue(db: Client, user: dict, pass_id: str) -> GatePassOut:
    row = _fetch(db, pass_id)
    _require_state(row, "approved")
    return GatePassOut.model_validate(update(db, _TABLE, pass_id, {"status": "issued", "issued_by": user["id"], "issued_at": _now_iso()}))


def mark_exit(db: Client, user: dict, pass_id: str, data: GatePassAction) -> GatePassOut:
    row = _fetch(db, pass_id)
    _require_state(row, "issued")
    payload = {"status": "exited", "verified_by": user["id"], "departure_at": _now_iso()}
    if data.notes:
        payload["notes"] = data.notes
    return GatePassOut.model_validate(update(db, _TABLE, pass_id, payload))


def mark_return(db: Client, user: dict, pass_id: str, data: GatePassAction) -> GatePassOut:
    row = _fetch(db, pass_id)
    _require_state(row, "exited")
    payload = {"status": "returned", "verified_by": user["id"], "actual_return_at": _now_iso()}
    if data.notes:
        payload["notes"] = data.notes
    return GatePassOut.model_validate(update(db, _TABLE, pass_id, payload))


def cancel(db: Client, pass_id: str) -> GatePassOut:
    row = _fetch(db, pass_id)
    if row["status"] not in ("pending", "approved"):
        raise ConflictError(
            f"Cannot cancel a gate pass in '{row['status']}' state", code="invalid_transition"
        )
    return GatePassOut.model_validate(update(db, _TABLE, pass_id, {"status": "cancelled"}))
