"""Meal record business logic.

One record per (resident, meal_date, meal_type) — enforced by the database
UNIQUE constraint (duplicate marks surface as 409).
"""

from __future__ import annotations

from supabase import Client

from app.core.exceptions import NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.meals.schemas import MealList, MealMark, MealOut, MealUpdate

_TABLE = "meals"


def mark(db: Client, user: dict, data: MealMark) -> MealOut:
    if get_by_id(db, "residents", str(data.resident_id)) is None:
        raise NotFoundError("Resident not found", code="resident_not_found")
    payload = data.model_dump(mode="json")
    payload["marked_by"] = user["id"]
    return MealOut.model_validate(insert(db, _TABLE, payload))


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
        order="meal_date", desc=True,
    )
    return MealList(items=[MealOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)
