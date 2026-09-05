"""Unit tests for app.notifications.service: best-effort notify(), and the
notify_resident/notify_staff lookup-and-forward helpers.

notify_resident/notify_staff each do a *local* `from app.database.crud import
get_by_id` inside their own function body (re-executed at call time), so
patching app.notifications.service.get_by_id has no effect on them — the
patch target must be app.database.crud.get_by_id itself. `notify` itself is
called as a plain module-global reference from notify_resident/notify_staff,
so patching app.notifications.service.notify works normally.
"""

from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

from app.notifications.service import notify, notify_resident, notify_staff

USER_ID = str(uuid4())


@patch("app.notifications.service.insert", side_effect=RuntimeError("db down"))
def test_notify_swallows_insert_failure(mock_insert):
    result = notify(None, user_id=USER_ID, title="t", message="m")
    assert result is None
    mock_insert.assert_called_once()


@patch("app.notifications.service.insert")
def test_notify_returns_notification_on_success(mock_insert):
    mock_insert.return_value = {
        "id": str(uuid4()),
        "user_id": USER_ID,
        "title": "t",
        "message": "m",
        "type": "system",
        "priority": "normal",
        "is_read": False,
        "read_at": None,
        "reference_type": None,
        "reference_id": None,
        "created_at": "2026-09-05T00:00:00+00:00",
    }
    result = notify(None, user_id=USER_ID, title="t", message="m")
    assert result is not None
    assert str(result.user_id) == USER_ID


@patch("app.database.crud.get_by_id", return_value=None)
@patch("app.notifications.service.notify")
def test_notify_resident_no_ops_when_resident_missing(mock_notify, mock_get_by_id):
    notify_resident(None, str(uuid4()), title="t", message="m")
    mock_notify.assert_not_called()


@patch("app.database.crud.get_by_id", return_value={"id": str(uuid4()), "user_id": None})
@patch("app.notifications.service.notify")
def test_notify_resident_no_ops_when_no_linked_user(mock_notify, mock_get_by_id):
    notify_resident(None, str(uuid4()), title="t", message="m")
    mock_notify.assert_not_called()


@patch("app.database.crud.get_by_id")
@patch("app.notifications.service.notify")
def test_notify_resident_forwards_to_notify(mock_notify, mock_get_by_id):
    mock_get_by_id.return_value = {"id": str(uuid4()), "user_id": USER_ID}
    notify_resident(None, str(uuid4()), title="t", message="m", reference_type="notice", reference_id="abc")
    mock_notify.assert_called_once_with(
        None, user_id=USER_ID, title="t", message="m", reference_type="notice", reference_id="abc",
    )


@patch("app.database.crud.get_by_id", return_value=None)
@patch("app.notifications.service.notify")
def test_notify_staff_no_ops_when_staff_missing(mock_notify, mock_get_by_id):
    notify_staff(None, str(uuid4()), title="t", message="m")
    mock_notify.assert_not_called()


@patch("app.database.crud.get_by_id", return_value={"id": str(uuid4()), "user_id": None})
@patch("app.notifications.service.notify")
def test_notify_staff_no_ops_when_no_linked_user(mock_notify, mock_get_by_id):
    notify_staff(None, str(uuid4()), title="t", message="m")
    mock_notify.assert_not_called()


@patch("app.database.crud.get_by_id")
@patch("app.notifications.service.notify")
def test_notify_staff_forwards_to_notify(mock_notify, mock_get_by_id):
    mock_get_by_id.return_value = {"id": str(uuid4()), "user_id": USER_ID}
    notify_staff(None, str(uuid4()), title="t", message="m", reference_type="maintenance_ticket", reference_id="xyz")
    mock_notify.assert_called_once_with(
        None, user_id=USER_ID, title="t", message="m", reference_type="maintenance_ticket", reference_id="xyz",
    )
