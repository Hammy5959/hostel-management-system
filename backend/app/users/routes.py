"""User account management endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.users import service
from app.users.schemas import UserCreate, UserList, UserOut, UserStatusUpdate, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=UserList, summary="List users")
def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: str | None = None,
    role_id: str | None = None,
    status: str | None = None,
    _: dict = Depends(require_permission("users.view")),
    db: Client = Depends(get_db),
) -> UserList:
    return service.list_users(db, page=page, per_page=per_page, search=search, role_id=role_id, status=status)


@router.post("", response_model=UserOut, status_code=201, summary="Create a user account")
def create_user(
    payload: UserCreate,
    user: dict = Depends(require_permission("users.create")),
    db: Client = Depends(get_db),
) -> UserOut:
    return service.create_user(db, payload, actor=user)


@router.get("/{user_id}", response_model=UserOut, summary="Get a user")
def get_user(
    user_id: str,
    _: dict = Depends(require_permission("users.view")),
    db: Client = Depends(get_db),
) -> UserOut:
    return service.get_user(db, user_id)


@router.patch("/{user_id}", response_model=UserOut, summary="Update a user")
def update_user(
    user_id: str,
    payload: UserUpdate,
    user: dict = Depends(require_permission("users.update")),
    db: Client = Depends(get_db),
) -> UserOut:
    return service.update_user(db, user_id, payload, actor=user)


@router.patch("/{user_id}/status", response_model=UserOut, summary="Activate/deactivate/suspend a user")
def set_status(
    user_id: str,
    payload: UserStatusUpdate,
    user: dict = Depends(require_permission("users.update")),
    db: Client = Depends(get_db),
) -> UserOut:
    return service.set_user_status(db, user_id, payload, actor=user)


@router.delete("/{user_id}", response_model=UserOut, summary="Soft-delete (archive) a user account")
def delete_user(
    user_id: str,
    user: dict = Depends(require_permission("users.update")),
    db: Client = Depends(get_db),
) -> UserOut:
    """Archive a user: sets status='deleted', blocking authentication while
    preserving staff/resident links, financial history and audit records.
    Super admin accounts and self-deletion are rejected."""
    return service.delete_user(db, user_id, actor=user)
