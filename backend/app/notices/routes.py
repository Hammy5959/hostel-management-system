"""Notice endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.dependencies import get_current_user
from app.core.permissions import require_permission
from app.notices import service
from app.notices.schemas import NoticeCreate, NoticeList, NoticeOut, NoticeUpdate

router = APIRouter(prefix="/notices", tags=["notices"])


@router.get("", response_model=NoticeList, summary="List notices")
def list_notices(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    category: str | None = None,
    published_only: bool = False,
    user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> NoticeList:
    return service.list_notices(db, user, page=page, per_page=per_page, category=category, published_only=published_only)


@router.post("", response_model=NoticeOut, status_code=201, summary="Create a notice (draft)")
def create(
    payload: NoticeCreate,
    user: dict = Depends(require_permission("notices.create")),
    db: Client = Depends(get_db),
) -> NoticeOut:
    return service.create(db, user, payload)


@router.get("/{notice_id}", response_model=NoticeOut, summary="Get a notice")
def get(
    notice_id: str,
    _: dict = Depends(require_permission("notices.view")),
    db: Client = Depends(get_db),
) -> NoticeOut:
    return service.get(db, notice_id)


@router.patch("/{notice_id}", response_model=NoticeOut, summary="Update a notice")
def update(
    notice_id: str,
    payload: NoticeUpdate,
    _: dict = Depends(require_permission("notices.update")),
    db: Client = Depends(get_db),
) -> NoticeOut:
    return service.update(db, notice_id, payload)


@router.post("/{notice_id}/publish", response_model=NoticeOut, summary="Publish a notice")
def publish(
    notice_id: str,
    _: dict = Depends(require_permission("notices.publish")),
    db: Client = Depends(get_db),
) -> NoticeOut:
    return service.set_published(db, notice_id, True)


@router.post("/{notice_id}/unpublish", response_model=NoticeOut, summary="Unpublish a notice")
def unpublish(
    notice_id: str,
    _: dict = Depends(require_permission("notices.publish")),
    db: Client = Depends(get_db),
) -> NoticeOut:
    return service.set_published(db, notice_id, False)


@router.delete("/{notice_id}", summary="Delete a notice")
def delete_notice(
    notice_id: str,
    _: dict = Depends(require_permission("notices.update")),
    db: Client = Depends(get_db),
) -> dict:
    return service.delete_notice(db, notice_id)
