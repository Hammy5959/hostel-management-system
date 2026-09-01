"""Mess menu endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.mess_menus import service
from app.mess_menus.schemas import MenuCreate, MenuList, MenuOut, MenuUpdate

router = APIRouter(prefix="/mess-menus", tags=["mess-menus"])


@router.get("", response_model=MenuList, summary="List mess menus")
def list_menus(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    date_from: str | None = None,
    date_to: str | None = None,
    _: dict = Depends(require_permission("mess_menus.view")),
    db: Client = Depends(get_db),
) -> MenuList:
    return service.list_menus(db, page=page, per_page=per_page, date_from=date_from, date_to=date_to)


@router.post("", response_model=MenuOut, status_code=201, summary="Create a mess menu")
def create(
    payload: MenuCreate,
    user: dict = Depends(require_permission("mess_menus.create")),
    db: Client = Depends(get_db),
) -> MenuOut:
    return service.create(db, user, payload)


@router.get("/{menu_id}", response_model=MenuOut, summary="Get a mess menu")
def get(
    menu_id: str,
    _: dict = Depends(require_permission("mess_menus.view")),
    db: Client = Depends(get_db),
) -> MenuOut:
    return service.get(db, menu_id)


@router.patch("/{menu_id}", response_model=MenuOut, summary="Update a mess menu")
def update(
    menu_id: str,
    payload: MenuUpdate,
    _: dict = Depends(require_permission("mess_menus.update")),
    db: Client = Depends(get_db),
) -> MenuOut:
    return service.update(db, menu_id, payload)


@router.delete("/{menu_id}", summary="Delete a mess menu")
def delete_menu(
    menu_id: str,
    _: dict = Depends(require_permission("mess_menus.delete")),
    db: Client = Depends(get_db),
) -> dict:
    return service.delete_menu(db, menu_id)
