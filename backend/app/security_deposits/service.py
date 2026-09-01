"""Security deposit business logic.

Lifecycle: pending -> received -> (partially_refunded | refunded | forfeited).
Refunds are capped at the remaining balance (received - deducted - refunded);
deductions reduce what can be refunded. All amounts are Decimal.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from supabase import Client

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.security_deposits.schemas import (
    DepositCreate,
    DepositDeduct,
    DepositList,
    DepositOut,
    DepositReceive,
    DepositRefund,
    DepositUpdate,
)

_TABLE = "security_deposits"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fetch(db: Client, deposit_id: str) -> dict:
    row = get_by_id(db, _TABLE, deposit_id)
    if row is None:
        raise NotFoundError("Security deposit not found", code="deposit_not_found")
    return row


def create(db: Client, data: DepositCreate) -> DepositOut:
    if get_by_id(db, "residents", str(data.resident_id)) is None:
        raise NotFoundError("Resident not found", code="resident_not_found")
    payload = data.model_dump(mode="json")
    payload["status"] = "pending"
    return DepositOut.model_validate(insert(db, _TABLE, payload))


def list_deposits(
    db: Client, *, page: int, per_page: int, resident_id: str | None, status: str | None
) -> DepositList:
    eq: dict = {}
    if resident_id:
        eq["resident_id"] = resident_id
    if status:
        eq["status"] = status
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page, eq=eq or None, order="created_at", desc=True
    )
    return DepositList(items=[DepositOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def update(db: Client, deposit_id: str, data: DepositUpdate) -> DepositOut:
    _fetch(db, deposit_id)
    return DepositOut.model_validate(update(db, _TABLE, deposit_id, data.model_dump(exclude_unset=True)))


def receive(db: Client, user: dict, deposit_id: str, data: DepositReceive) -> DepositOut:
    deposit = _fetch(db, deposit_id)
    if deposit["status"] != "pending":
        raise ConflictError(f"Cannot receive a deposit in '{deposit['status']}' state", code="invalid_transition")
    return DepositOut.model_validate(update(db, _TABLE, deposit_id, {
        "status": "received",
        "received_amount": deposit["amount"],
        "received_at": _now_iso(),
        "received_by": user["id"],
        "notes": data.notes if data.notes is not None else deposit.get("notes"),
    }))


def deduct(db: Client, deposit_id: str, data: DepositDeduct) -> DepositOut:
    deposit = _fetch(db, deposit_id)
    if deposit["status"] == "pending":
        raise ConflictError("Deposit must be received before deductions", code="invalid_transition")
    new_deducted = Decimal(deposit["deducted_amount"]) + data.amount
    receivable = Decimal(deposit["received_amount"])
    if new_deducted > receivable:
        raise BadRequestError("Deduction exceeds the received amount", code="deduction_exceeds_amount")
    status = "forfeited" if new_deducted >= receivable else deposit["status"]
    return DepositOut.model_validate(update(db, _TABLE, deposit_id, {
        "deducted_amount": str(new_deducted),
        "deduction_reason": data.reason or deposit.get("deduction_reason"),
        "status": status,
    }))


def refund(db: Client, user: dict, deposit_id: str, data: DepositRefund) -> DepositOut:
    deposit = _fetch(db, deposit_id)
    if deposit["status"] == "pending":
        raise ConflictError("Deposit must be received before refunds", code="invalid_transition")

    received = Decimal(deposit["received_amount"])
    deducted = Decimal(deposit["deducted_amount"])
    refunded = Decimal(deposit["refunded_amount"])
    remaining = received - deducted - refunded
    if data.amount > remaining:
        raise BadRequestError(
            f"Refund exceeds the remaining balance of {remaining}", code="refund_exceeds_balance"
        )

    new_refunded = refunded + data.amount
    status = "refunded" if new_refunded >= received - deducted else "partially_refunded"
    return DepositOut.model_validate(update(db, _TABLE, deposit_id, {
        "refunded_amount": str(new_refunded),
        "refunded_at": _now_iso(),
        "refunded_by": user["id"],
        "refund_reference": data.reference or deposit.get("refund_reference"),
        "status": status,
    }))
