"""Meal record endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.meals import service
from app.meals.schemas import MealList, MealMark, MealOut, MealUpdate

router = APIRouter(prefix="/meals", tags=["meals"])


@router.get("", response_model=MealList, summary="List meal records")
def list_meals(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    resident_id: str | None = None,
    meal_date: str | None = None,
    meal_type: str | None = None,
    _: dict = Depends(require_permission("meals.view")),
    db: Client = Depends(get_db),
) -> MealList:
    return service.list_meals(db, page=page, per_page=per_page, resident_id=resident_id, meal_date=meal_date, meal_type=meal_type)


@router.post("", response_model=MealOut, status_code=201, summary="Mark a meal")
def mark(
    payload: MealMark,
    user: dict = Depends(require_permission("meals.create")),
    db: Client = Depends(get_db),
) -> MealOut:
    return service.mark(db, user, payload)


@router.patch("/{meal_id}", response_model=MealOut, summary="Update a meal record")
def update_meal(
    meal_id: str,
    payload: MealUpdate,
    _: dict = Depends(require_permission("meals.update")),
    db: Client = Depends(get_db),
) -> MealOut:
    return service.update_meal(db, meal_id, payload)
