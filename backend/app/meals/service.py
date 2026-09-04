"""Meal record business logic.

One row per (resident, meal_date, meal_type) — enforced by a database UNIQUE
constraint. mark()/bulk_mark() upsert on that constraint (see
app.database.crud.upsert) so a repeat submission from a checkbox UI updates
`consumed` instead of surfacing a 409.
"""

from __future__ import annotations

from supabase import Client

from app.core.exceptions import ConflictError, NotFoundError
from app.database.crud import get_by_id, list_page, update, upsert
from app.meals.schemas import (
    MealBulkFailure,
    MealBulkMark,
    MealBulkResult,
    MealList,
    MealMark,
    MealOut,
    MealRegister,
    MealRegisterEntry,
    MealUpdate,
)
from app.residents.service import RESIDING_STATUSES

_TABLE = "meals"
_ON_CONFLICT = "resident_id,meal_date,meal_type"

# list_page is pagination-oriented; the register needs the full roster in one
# shot, so this is a generous fixed cap rather than a true unbounded fetch.
# Revisit with a dedicated "fetch all" helper if resident counts ever
# approach it.
_REGISTER_MAX_RESIDENTS = 2000


def _check_resident_active(resident: dict) -> None:
    # Same guard as app.visitors.service.create_visitor: only checked_out is
    # blocked — on_leave is temporary (bed still allocated), so it stays allowed.
    if resident["status"] == "checked_out":
        raise ConflictError(
            "Cannot mark a meal for a resident who has checked out", code="resident_not_active",
        )


def mark(db: Client, user: dict, data: MealMark) -> MealOut:
    resident = get_by_id(db, "residents", str(data.resident_id))
    if resident is None:
        raise NotFoundError("Resident not found", code="resident_not_found")
    _check_resident_active(resident)
    payload = data.model_dump(mode="json")
    payload["marked_by"] = user["id"]
    rows = upsert(db, _TABLE, payload, on_conflict=_ON_CONFLICT)
    return MealOut.model_validate(rows[0])


def bulk_mark(db: Client, user: dict, data: MealBulkMark) -> MealBulkResult:
    failed: list[MealBulkFailure] = []
    payloads_by_resident: dict[str, dict] = {}
    for entry in data.entries:
        resident_id = str(entry.resident_id)
        resident = get_by_id(db, "residents", resident_id)
        if resident is None:
            failed.append(
                MealBulkFailure(resident_id=entry.resident_id, code="resident_not_found", message="Resident not found")
            )
            continue
        if resident["status"] == "checked_out":
            failed.append(
                MealBulkFailure(
                    resident_id=entry.resident_id,
                    code="resident_not_active",
                    message="Cannot mark a meal for a resident who has checked out",
                )
            )
            continue
        # Postgres rejects ON CONFLICT DO UPDATE touching the same row twice
        # in one statement, so dedupe by resident_id (keep the last entry)
        # before the batched upsert below.
        payloads_by_resident[resident_id] = {
            "resident_id": resident_id,
            "meal_date": data.meal_date.isoformat(),
            "meal_type": data.meal_type,
            "consumed": entry.consumed,
            "marked_by": user["id"],
        }

    marked: list[MealOut] = []
    if payloads_by_resident:
        rows = upsert(db, _TABLE, list(payloads_by_resident.values()), on_conflict=_ON_CONFLICT)
        marked = [MealOut.model_validate(r) for r in rows]

    return MealBulkResult(marked=marked, failed=failed, marked_count=len(marked), failed_count=len(failed))


def update_meal(db: Client, meal_id: str, data: MealUpdate) -> MealOut:
    if get_by_id(db, _TABLE, meal_id) is None:
        raise NotFoundError("Meal record not found", code="meal_not_found")
    return MealOut.model_validate(update(db, _TABLE, meal_id, data.model_dump(exclude_unset=True)))


def list_meals(
    db: Client,
    *,
    page: int,
    per_page: int,
    resident_id: str | None,
    meal_date: str | None,
    meal_type: str | None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> MealList:
    eq: dict = {}
    if resident_id:
        eq["resident_id"] = resident_id
    if meal_date:
        eq["meal_date"] = meal_date
    if meal_type:
        eq["meal_type"] = meal_type
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page, eq=eq or None,
        gte={"meal_date": date_from} if date_from else None,
        lte={"meal_date": date_to} if date_to else None,
        order="meal_date", desc=True,
    )
    return MealList(items=[MealOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def get_register(db: Client, *, meal_date: str, meal_type: str) -> MealRegister:
    residents, _ = list_page(
        db, "residents", page=1, per_page=_REGISTER_MAX_RESIDENTS,
        select="id, first_name, last_name",
        in_={"status": list(RESIDING_STATUSES)},
        order="first_name", desc=False,
    )
    marks, _ = list_page(
        db, _TABLE, page=1, per_page=_REGISTER_MAX_RESIDENTS,
        eq={"meal_date": meal_date, "meal_type": meal_type},
    )
    by_resident = {m["resident_id"]: m for m in marks}
    items = [
        MealRegisterEntry(
            resident_id=r["id"],
            first_name=r["first_name"],
            last_name=r.get("last_name"),
            meal_id=by_resident.get(r["id"], {}).get("id"),
            consumed=by_resident.get(r["id"], {}).get("consumed", False),
        )
        for r in residents
    ]
    return MealRegister(meal_date=meal_date, meal_type=meal_type, items=items, total=len(items))
