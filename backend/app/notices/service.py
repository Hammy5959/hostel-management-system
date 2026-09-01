"""Notice business logic.

Staff create drafts and publish them; residents (and anyone authenticated)
see only published notices.
"""

from __future__ import annotations

from datetime import datetime, timezone

from supabase import Client

from app.common.authz import has_permission
from app.core.exceptions import NotFoundError
from app.database.crud import delete, get_by_id, insert, list_page, update
from app.notices.schemas import NoticeCreate, NoticeList, NoticeOut, NoticeUpdate

_TABLE = "notices"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create(db: Client, user: dict, data: NoticeCreate) -> NoticeOut:
    payload = data.model_dump(mode="json")
    payload["is_published"] = False
    payload["created_by"] = user["id"]
    return NoticeOut.model_validate(insert(db, _TABLE, payload))


def get(db: Client, notice_id: str) -> NoticeOut:
    row = get_by_id(db, _TABLE, notice_id)
    if row is None:
        raise NotFoundError("Notice not found", code="notice_not_found")
    return NoticeOut.model_validate(row)


def list_notices(
    db: Client,
    user: dict,
    *,
    page: int,
    per_page: int,
    category: str | None,
    published_only: bool,
) -> NoticeList:
    eq: dict = {}
    if category:
        eq["category"] = category
    # Non-staff viewers only ever see published notices.
    force_published = not has_permission(db, user, "notices.view")
    if published_only or force_published:
        eq["is_published"] = True
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page, eq=eq or None,
        order="created_at", desc=True,
    )
    return NoticeList(items=[NoticeOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def update(db: Client, notice_id: str, data: NoticeUpdate) -> NoticeOut:
    if get_by_id(db, _TABLE, notice_id) is None:
        raise NotFoundError("Notice not found", code="notice_not_found")
    return NoticeOut.model_validate(update(db, _TABLE, notice_id, data.model_dump(exclude_unset=True)))


def set_published(db: Client, notice_id: str, published: bool) -> NoticeOut:
    if get_by_id(db, _TABLE, notice_id) is None:
        raise NotFoundError("Notice not found", code="notice_not_found")
    payload = {"is_published": published}
    if published:
        payload["published_at"] = _now_iso()
    return NoticeOut.model_validate(update(db, _TABLE, notice_id, payload))


def delete_notice(db: Client, notice_id: str) -> dict:
    if get_by_id(db, _TABLE, notice_id) is None:
        raise NotFoundError("Notice not found", code="notice_not_found")
    delete(db, _TABLE, notice_id)
    return {"detail": "Notice deleted"}
