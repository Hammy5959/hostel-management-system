"""Unit tests for app.notices.service:
- the update() name-shadowing regression (Fix 0)
- set_published() auto-notifying the right audience, and only on publish
- list_notices()/get()'s permission gate + audience filtering
- audience field validation on create()/update()

Several collaborators are imported *locally* inside the function that uses
them (re-executed at call time), so patching app.notices.service.<name> has
no effect on those specific calls — the patch target must be the name's
origin module instead:
  - _resident_location() does `from app.allocations.service import
    get_resident_location` and `from app.residents.service import
    get_resident_by_user` locally -> patch those two directly.
  - _notify_audience() does `from app.allocations.service import
    list_resident_ids_by_location` locally -> patch that directly.
Everything else (has_permission, insert, list_page, db_update, notify_resident,
_all_resident_ids_with_user, _visible_to) is called as a plain module-global
reference and can be patched at app.notices.service.<name> normally.
"""

from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

import pytest

from app.core.exceptions import BadRequestError, NotFoundError
from app.notices.schemas import NoticeCreate, NoticeUpdate
from app.notices.service import _validate_audience, create, get, list_notices, set_published, update

USER = {"id": str(uuid4())}


def _notice_row(**overrides) -> dict:
    now = "2026-09-05T00:00:00+00:00"
    row = {
        "id": str(uuid4()),
        "title": "Water outage",
        "content": "Water will be off from 2-4pm.",
        "category": None,
        "is_published": False,
        "published_at": None,
        "expires_at": None,
        "audience_type": "all",
        "audience_building_id": None,
        "audience_floor_id": None,
        "created_by": USER["id"],
        "created_at": now,
        "updated_at": now,
    }
    row.update(overrides)
    return row


# ── Fix 0: update() no longer recurses into itself ──────────────────────────


@patch("app.notices.service.db_update")
@patch("app.notices.service.get_by_id")
def test_update_calls_db_update_not_itself(mock_get_by_id, mock_db_update):
    row = _notice_row()
    mock_get_by_id.return_value = row
    mock_db_update.return_value = _notice_row(title="Updated title")

    result = update(None, row["id"], NoticeUpdate(title="Updated title"))

    mock_db_update.assert_called_once_with(None, "notices", row["id"], {"title": "Updated title"})
    assert result.title == "Updated title"


@patch("app.notices.service.get_by_id", return_value=None)
def test_update_raises_not_found_for_missing_notice(mock_get_by_id):
    with pytest.raises(NotFoundError) as exc:
        update(None, str(uuid4()), NoticeUpdate(title="x"))
    assert exc.value.code == "notice_not_found"


# ── set_published(): audience-aware notify, only on publish ────────────────


@patch("app.notices.service.notify_resident")
@patch("app.notices.service._all_resident_ids_with_user")
@patch("app.notices.service.db_update")
@patch("app.notices.service.get_by_id")
def test_publish_all_audience_notifies_every_resident_with_user(
    mock_get_by_id, mock_db_update, mock_all_ids, mock_notify_resident,
):
    row = _notice_row()
    mock_get_by_id.return_value = row
    mock_db_update.return_value = _notice_row(is_published=True, published_at="2026-09-05T00:00:00+00:00")
    resident_ids = [str(uuid4()), str(uuid4())]
    mock_all_ids.return_value = resident_ids

    set_published(None, row["id"], True)

    assert mock_notify_resident.call_count == 2
    notified_ids = [call.args[1] for call in mock_notify_resident.call_args_list]
    assert notified_ids == resident_ids


@patch("app.allocations.service.list_resident_ids_by_location")
@patch("app.notices.service.notify_resident")
@patch("app.notices.service.db_update")
@patch("app.notices.service.get_by_id")
def test_publish_building_audience_notifies_only_that_building(
    mock_get_by_id, mock_db_update, mock_notify_resident, mock_by_location,
):
    building_id = str(uuid4())
    row = _notice_row(audience_type="building", audience_building_id=building_id)
    mock_get_by_id.return_value = row
    mock_db_update.return_value = _notice_row(
        is_published=True, audience_type="building", audience_building_id=building_id,
    )
    resident_ids = [str(uuid4())]
    mock_by_location.return_value = resident_ids

    set_published(None, row["id"], True)

    mock_by_location.assert_called_once_with(None, building_id=building_id, floor_id=None)
    mock_notify_resident.assert_called_once()
    assert mock_notify_resident.call_args.args[1] == resident_ids[0]


@patch("app.notices.service.notify_resident")
@patch("app.notices.service.db_update")
@patch("app.notices.service.get_by_id")
def test_unpublish_sends_no_notifications(mock_get_by_id, mock_db_update, mock_notify_resident):
    row = _notice_row(is_published=True)
    mock_get_by_id.return_value = row
    mock_db_update.return_value = _notice_row(is_published=False)

    set_published(None, row["id"], False)

    mock_notify_resident.assert_not_called()


@patch("app.notices.service.notify_resident")
@patch("app.notices.service._all_resident_ids_with_user")
@patch("app.notices.service.db_update")
@patch("app.notices.service.get_by_id")
def test_publish_notify_failure_does_not_abort_publish(
    mock_get_by_id, mock_db_update, mock_all_ids, mock_notify_resident,
):
    row = _notice_row()
    mock_get_by_id.return_value = row
    mock_db_update.return_value = _notice_row(is_published=True)
    mock_all_ids.return_value = [str(uuid4())]
    mock_notify_resident.side_effect = RuntimeError("boom")

    result = set_published(None, row["id"], True)

    assert result.is_published is True


# ── list_notices(): permission gate + audience filtering ───────────────────


@patch("app.notices.service.list_page")
@patch("app.notices.service.has_permission")
def test_list_notices_staff_sees_everything_unfiltered(mock_has_permission, mock_list_page):
    mock_has_permission.side_effect = lambda db, user, perm: perm == "notices.create"
    mock_list_page.return_value = ([], 0)

    list_notices(None, USER, page=1, per_page=20, category=None, published_only=False)

    _, kwargs = mock_list_page.call_args
    assert kwargs["eq"] is None
    assert kwargs["or_"] == []


@patch("app.allocations.service.get_resident_location")
@patch("app.residents.service.get_resident_by_user")
@patch("app.notices.service.list_page")
@patch("app.notices.service.has_permission", return_value=False)
def test_list_notices_resident_forced_published_and_scoped_to_location(
    mock_has_permission, mock_list_page, mock_get_resident_by_user, mock_get_location,
):
    mock_list_page.return_value = ([], 0)
    resident_id = str(uuid4())
    building_id = str(uuid4())
    floor_id = str(uuid4())
    mock_get_resident_by_user.return_value = {"id": resident_id}
    mock_get_location.return_value = (building_id, floor_id)

    list_notices(None, USER, page=1, per_page=20, category=None, published_only=False)

    _, kwargs = mock_list_page.call_args
    assert kwargs["eq"]["is_published"] is True
    assert "audience_type.eq.all" in kwargs["or_"]
    assert f"and(audience_type.eq.building,audience_building_id.eq.{building_id})" in kwargs["or_"]
    assert f"and(audience_type.eq.floor,audience_floor_id.eq.{floor_id})" in kwargs["or_"]


@patch("app.allocations.service.get_resident_location", return_value=(None, None))
@patch("app.residents.service.get_resident_by_user", return_value=None)
@patch("app.notices.service.list_page")
@patch("app.notices.service.has_permission", return_value=False)
def test_list_notices_non_resident_viewer_only_sees_all_audience(
    mock_has_permission, mock_list_page, mock_get_resident_by_user, mock_get_location,
):
    mock_list_page.return_value = ([], 0)

    list_notices(None, USER, page=1, per_page=20, category=None, published_only=False)

    _, kwargs = mock_list_page.call_args
    assert kwargs["or_"] == ["audience_type.eq.all"]


# ── get(): hides notices outside the viewer's audience ──────────────────────


@patch("app.allocations.service.get_resident_location", return_value=(None, None))
@patch("app.residents.service.get_resident_by_user", return_value=None)
@patch("app.notices.service.has_permission", return_value=False)
@patch("app.notices.service.get_by_id")
def test_get_hides_unpublished_notice_from_restricted_viewer(
    mock_get_by_id, mock_has_permission, mock_get_resident_by_user, mock_get_location,
):
    mock_get_by_id.return_value = _notice_row(is_published=False)
    with pytest.raises(NotFoundError) as exc:
        get(None, USER, str(uuid4()))
    assert exc.value.code == "notice_not_found"


@patch("app.notices.service.has_permission", side_effect=lambda db, user, perm: perm == "notices.publish")
@patch("app.notices.service.get_by_id")
def test_get_allows_manager_to_see_unpublished_notice(mock_get_by_id, mock_has_permission):
    row = _notice_row(is_published=False)
    mock_get_by_id.return_value = row
    result = get(None, USER, row["id"])
    assert str(result.id) == row["id"]


# ── audience validation ──────────────────────────────────────────────────


def test_validate_audience_all_forbids_building_and_floor():
    with pytest.raises(BadRequestError):
        _validate_audience("all", str(uuid4()), None)
    with pytest.raises(BadRequestError):
        _validate_audience("all", None, str(uuid4()))


def test_validate_audience_building_requires_building_id():
    with pytest.raises(BadRequestError):
        _validate_audience("building", None, None)


def test_validate_audience_floor_requires_floor_id():
    with pytest.raises(BadRequestError):
        _validate_audience("floor", None, None)


def test_validate_audience_valid_combinations_pass():
    _validate_audience("all", None, None)
    _validate_audience("building", str(uuid4()), None)
    _validate_audience("floor", None, str(uuid4()))


@patch("app.notices.service.insert")
def test_create_rejects_mismatched_audience(mock_insert):
    data = NoticeCreate(title="t", content="c", audience_type="building", audience_building_id=None)
    with pytest.raises(BadRequestError):
        create(None, USER, data)
    mock_insert.assert_not_called()
