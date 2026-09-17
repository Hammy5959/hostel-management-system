"""Unit tests for audit coverage in app.mess_menus.service.delete_menu."""

from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

from app.core.exceptions import NotFoundError
from app.mess_menus.service import delete_menu


def _menu_row(**overrides) -> dict:
    row = {"id": str(uuid4()), "menu_date": "2026-09-05"}
    row.update(overrides)
    return row


@patch("app.mess_menus.service.record_audit")
@patch("app.mess_menus.service.delete")
@patch("app.mess_menus.service.get_by_id")
def test_delete_menu_records_audit(mock_get_by_id, mock_delete, mock_record_audit):
    user = {"id": str(uuid4())}
    menu = _menu_row()
    mock_get_by_id.return_value = menu

    result = delete_menu(None, user, menu["id"])

    mock_delete.assert_called_once()
    mock_record_audit.assert_called_once()
    kwargs = mock_record_audit.call_args.kwargs
    assert kwargs["action"] == "mess_menu.delete"
    assert kwargs["user_id"] == user["id"]
    assert result == {"detail": "Mess menu deleted"}


@patch("app.mess_menus.service.record_audit")
@patch("app.mess_menus.service.get_by_id")
def test_delete_menu_not_found_skips_audit(mock_get_by_id, mock_record_audit):
    mock_get_by_id.return_value = None

    try:
        delete_menu(None, {"id": str(uuid4())}, str(uuid4()))
        assert False, "expected NotFoundError"
    except NotFoundError:
        pass

    mock_record_audit.assert_not_called()
