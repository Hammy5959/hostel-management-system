"""Notice business logic.

Staff create drafts and publish them; residents (and anyone else without
notices management rights) see only published notices, optionally narrowed
further by an audience (building/floor) the notice was targeted at.
"""

from __future__ import annotations

from datetime import datetime, timezone

from supabase import Client

from app.common.authz import has_permission
from app.core.exceptions import BadRequestError, NotFoundError
from app.core.logging import get_logger
from app.database.crud import delete, get_by_id, insert, list_page
from app.database.crud import update as db_update
from app.notices.schemas import NoticeCreate, NoticeList, NoticeOut, NoticeUpdate
from app.notifications.service import notify_resident

_TABLE = "notices"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_audience(audience_type: str, building_id, floor_id) -> None:
    if audience_type == "all" and (building_id or floor_id):
        raise BadRequestError("audience_type 'all' cannot specify a building or floor", code="invalid_audience")
    if audience_type == "building" and not building_id:
        raise BadRequestError("audience_building_id is required when audience_type is 'building'", code="invalid_audience")
    if audience_type == "building" and floor_id:
        raise BadRequestError("audience_type 'building' cannot also specify a floor", code="invalid_audience")
    if audience_type == "floor" and not floor_id:
        raise BadRequestError("audience_floor_id is required when audience_type is 'floor'", code="invalid_audience")
    if audience_type == "floor" and building_id:
        raise BadRequestError("audience_type 'floor' cannot also specify a building", code="invalid_audience")


def _can_manage_notices(db: Client, user: dict) -> bool:
    """Staff who can author/publish notices see every notice regardless of
    published state or audience. `notices.view` alone (held by residents too,
    per the seed catalog) is NOT enough — see module docstring."""
    return (
        has_permission(db, user, "notices.create")
        or has_permission(db, user, "notices.update")
        or has_permission(db, user, "notices.publish")
    )


def create(db: Client, user: dict, data: NoticeCreate) -> NoticeOut:
    _validate_audience(data.audience_type, data.audience_building_id, data.audience_floor_id)
    payload = data.model_dump(mode="json")
    payload["is_published"] = False
    payload["created_by"] = user["id"]
    return NoticeOut.model_validate(insert(db, _TABLE, payload))


def get(db: Client, user: dict, notice_id: str) -> NoticeOut:
    row = get_by_id(db, _TABLE, notice_id)
    if row is None:
        raise NotFoundError("Notice not found", code="notice_not_found")
    notice = NoticeOut.model_validate(row)
    if not _can_manage_notices(db, user) and not _visible_to(db, user, notice):
        # Don't reveal that an unpublished/not-targeted notice exists.
        raise NotFoundError("Notice not found", code="notice_not_found")
    return notice


def _resident_location(db: Client, user: dict) -> tuple[str | None, str | None]:
    from app.allocations.service import get_resident_location
    from app.residents.service import get_resident_by_user

    resident = get_resident_by_user(db, user["id"])
    if resident is None:
        return None, None
    return get_resident_location(db, resident["id"])


def _visible_to(db: Client, user: dict, notice: NoticeOut) -> bool:
    if not notice.is_published:
        return False
    if notice.audience_type == "all":
        return True
    building_id, floor_id = _resident_location(db, user)
    if notice.audience_type == "building":
        return building_id is not None and str(notice.audience_building_id) == str(building_id)
    if notice.audience_type == "floor":
        return floor_id is not None and str(notice.audience_floor_id) == str(floor_id)
    return False


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
    or_: list[str] = []
    # Non-managing viewers (including residents, who only hold notices.view)
    # only ever see published notices, further narrowed to their audience.
    force_published = not _can_manage_notices(db, user)
    if published_only or force_published:
        eq["is_published"] = True
    if force_published:
        building_id, floor_id = _resident_location(db, user)
        or_ = ["audience_type.eq.all"]
        if building_id:
            or_.append(f"and(audience_type.eq.building,audience_building_id.eq.{building_id})")
        if floor_id:
            or_.append(f"and(audience_type.eq.floor,audience_floor_id.eq.{floor_id})")
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page, eq=eq or None, or_=or_,
        order="created_at", desc=True,
    )
    return NoticeList(items=[NoticeOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def update(db: Client, notice_id: str, data: NoticeUpdate) -> NoticeOut:
    existing = get_by_id(db, _TABLE, notice_id)
    if existing is None:
        raise NotFoundError("Notice not found", code="notice_not_found")
    payload = data.model_dump(exclude_unset=True)
    if any(k in payload for k in ("audience_type", "audience_building_id", "audience_floor_id")):
        audience_type = payload.get("audience_type", existing.get("audience_type", "all"))
        building_id = payload.get("audience_building_id", existing.get("audience_building_id"))
        floor_id = payload.get("audience_floor_id", existing.get("audience_floor_id"))
        _validate_audience(audience_type, building_id, floor_id)
    return NoticeOut.model_validate(db_update(db, _TABLE, notice_id, payload))


def set_published(db: Client, notice_id: str, published: bool) -> NoticeOut:
    if get_by_id(db, _TABLE, notice_id) is None:
        raise NotFoundError("Notice not found", code="notice_not_found")
    payload = {"is_published": published}
    if published:
        payload["published_at"] = _now_iso()
    notice = NoticeOut.model_validate(db_update(db, _TABLE, notice_id, payload))
    if published:
        _notify_audience(db, notice)
    return notice


def _all_resident_ids_with_user(db: Client) -> list[str]:
    """Bounded like the meals register endpoint's resident cap — a single
    page is enough at hostel scale; revisit with real pagination if this
    ever needs to scale past a few thousand residents."""
    rows, _ = list_page(db, "residents", page=1, per_page=2000, eq={})
    return [r["id"] for r in rows if r.get("user_id")]


def _notify_audience(db: Client, notice: NoticeOut) -> None:
    if notice.audience_type == "all":
        resident_ids = _all_resident_ids_with_user(db)
    else:
        from app.allocations.service import list_resident_ids_by_location

        resident_ids = list_resident_ids_by_location(
            db,
            building_id=str(notice.audience_building_id) if notice.audience_type == "building" else None,
            floor_id=str(notice.audience_floor_id) if notice.audience_type == "floor" else None,
        )
    for resident_id in resident_ids:
        try:
            notify_resident(
                db,
                resident_id,
                title=notice.title,
                message=notice.content[:200],
                reference_type="notice",
                reference_id=str(notice.id),
            )
        except Exception:
            # notify_resident/notify are already best-effort internally, but
            # guard here too so one bad resident_id can never abort the fan-out
            # or the publish call itself.
            get_logger(__name__).exception("Failed to notify resident %s of notice %s", resident_id, notice.id)


def delete_notice(db: Client, notice_id: str) -> dict:
    if get_by_id(db, _TABLE, notice_id) is None:
        raise NotFoundError("Notice not found", code="notice_not_found")
    delete(db, _TABLE, notice_id)
    return {"detail": "Notice deleted"}
