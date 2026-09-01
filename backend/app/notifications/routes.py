"""Notification endpoints (own notifications only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.dependencies import get_current_user
from app.notifications import service
from app.notifications.schemas import NotificationList, NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationList, summary="List my notifications")
def list_own(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    unread_only: bool = False,
    user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> NotificationList:
    return service.list_own(db, user, page=page, per_page=per_page, unread_only=unread_only)


@router.get("/unread-count", summary="Unread notification count")
def unread_count(
    user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict:
    return {"unread_count": service.unread_count(db, user)}


@router.post("/{notification_id}/read", response_model=NotificationOut, summary="Mark a notification as read")
def mark_read(
    notification_id: str,
    user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> NotificationOut:
    return service.mark_read(db, user, notification_id)


@router.post("/read-all", summary="Mark all my notifications as read")
def mark_all_read(
    user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict:
    return service.mark_all_read(db, user)
