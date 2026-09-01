"""Staff record business logic."""

from __future__ import annotations

from supabase import Client

from app.core.exceptions import ConflictError, NotFoundError
from app.staff import crud
from app.staff.schemas import StaffCreate, StaffList, StaffOut, StaffUpdate
from app.users.crud import get_user_by_id


def create_staff(db: Client, data: StaffCreate) -> StaffOut:
    user = get_user_by_id(db, str(data.user_id))
    if user is None:
        raise NotFoundError("User not found", code="user_not_found")
    if crud.get_staff_by_user(db, str(data.user_id)) is not None:
        raise ConflictError("This user already has a staff record", code="staff_exists")
    record = crud.create_staff(db, data.model_dump(mode="json"))
    return StaffOut.model_validate(record)


def get_staff(db: Client, staff_id: str) -> StaffOut:
    record = crud.get_staff(db, staff_id)
    if record is None:
        raise NotFoundError("Staff record not found", code="staff_not_found")
    return StaffOut.model_validate(record)


def list_staff(db: Client, *, page: int, per_page: int, search: str | None, department: str | None) -> StaffList:
    items, total = crud.list_staff(db, page=page, per_page=per_page, search=search, department=department)
    return StaffList(items=[StaffOut.model_validate(r) for r in items], total=total, page=page, per_page=per_page)


def update_staff(db: Client, staff_id: str, data: StaffUpdate) -> StaffOut:
    record = crud.get_staff(db, staff_id)
    if record is None:
        raise NotFoundError("Staff record not found", code="staff_not_found")
    updated = crud.update_staff(db, staff_id, data.model_dump(exclude_unset=True))
    return StaffOut.model_validate(updated)
