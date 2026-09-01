"""Mess menu business logic."""

from __future__ import annotations

from supabase import Client

from app.core.exceptions import NotFoundError
from app.database.crud import delete, get_by_id, insert, list_page, update
from app.mess_menus.schemas import MenuCreate, MenuList, MenuOut, MenuUpdate

_TABLE = "mess_menus"


def create(db: Client, user: dict, data: MenuCreate) -> MenuOut:
    payload = data.model_dump(mode="json")
    payload["created_by"] = user["id"]
    return MenuOut.model_validate(insert(db, _TABLE, payload))


def get(db: Client, menu_id: str) -> MenuOut:
    row = get_by_id(db, _TABLE, menu_id)
    if row is None:
        raise NotFoundError("Mess menu not found", code="menu_not_found")
    return MenuOut.model_validate(row)


def list_menus(db: Client, *, page: int, per_page: int, date_from: str | None, date_to: str | None) -> MenuList:
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        gte={"menu_date": date_from} if date_from else None,
        lte={"menu_date": date_to} if date_to else None,
        order="menu_date", desc=True,
    )
    return MenuList(items=[MenuOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def update(db: Client, menu_id: str, data: MenuUpdate) -> MenuOut:
    if get_by_id(db, _TABLE, menu_id) is None:
        raise NotFoundError("Mess menu not found", code="menu_not_found")
    return MenuOut.model_validate(update(db, _TABLE, menu_id, data.model_dump(exclude_unset=True)))


def delete_menu(db: Client, menu_id: str) -> dict:
    if get_by_id(db, _TABLE, menu_id) is None:
        raise NotFoundError("Mess menu not found", code="menu_not_found")
    delete(db, _TABLE, menu_id)
    return {"detail": "Mess menu deleted"}
