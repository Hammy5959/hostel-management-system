"""Unit tests for the hostel_settings singleton behavior and new fields."""

from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

from app.hostel_settings.schemas import HostelSettingsOut, HostelSettingsUpdate
from app.hostel_settings.service import get_current, update_current


def _settings_row(**overrides) -> dict:
    now = "2026-09-17T00:00:00+00:00"
    row = {
        "id": str(uuid4()),
        "hostel_name": "My Hostel",
        "hostel_code": None,
        "address": None,
        "city": None,
        "state": None,
        "country": None,
        "phone": None,
        "email": None,
        "total_capacity": None,
        "logo_url": None,
        "timezone": "Asia/Karachi",
        "currency": "PKR",
        "created_at": now,
        "updated_at": now,
    }
    row.update(overrides)
    return row


class _FakeResult:
    def __init__(self, data):
        self.data = data
        self.error = None


class _FakeTable:
    def __init__(self, select_data):
        self._select_data = select_data
        self.update_payload = None
        self.eq_calls: list[tuple[str, object]] = []

    def select(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def update(self, payload):
        self.update_payload = payload
        return self

    def eq(self, column, value):
        self.eq_calls.append((column, value))
        return self

    def execute(self):
        return _FakeResult(self._select_data)


class _FakeDb:
    def __init__(self, select_data):
        self.table_obj = _FakeTable(select_data)

    def table(self, _name):
        return self.table_obj


def test_get_current_returns_existing_row():
    row = _settings_row()
    db = _FakeDb([row])

    with patch("app.hostel_settings.service.upsert") as mock_upsert:
        result = get_current(db)

    mock_upsert.assert_not_called()
    assert str(result.id) == row["id"]
    assert result.currency == "PKR"


@patch("app.hostel_settings.service.upsert")
def test_get_current_seeds_default_row_when_empty(mock_upsert):
    seeded = _settings_row()
    mock_upsert.return_value = [seeded]
    db = _FakeDb([])

    result = get_current(db)

    mock_upsert.assert_called_once()
    args, kwargs = mock_upsert.call_args
    assert kwargs["on_conflict"] == "singleton"
    assert args[2]["singleton"] is True
    assert str(result.id) == seeded["id"]


def test_update_current_filters_by_singleton_not_id():
    row = _settings_row()
    db = _FakeDb([row])
    db.table_obj.execute = lambda: _FakeResult([row])  # update() also returns a row

    update_current(db, HostelSettingsUpdate(logo_url="https://example.com/logo.png"))

    assert ("singleton", True) in db.table_obj.eq_calls
    assert not any(col == "id" for col, _ in db.table_obj.eq_calls)
    assert db.table_obj.update_payload["logo_url"] == "https://example.com/logo.png"
    assert "updated_at" in db.table_obj.update_payload


def test_new_fields_round_trip():
    row = _settings_row(logo_url="https://example.com/logo.png", timezone="Asia/Karachi", currency="PKR")
    out = HostelSettingsOut.model_validate(row)
    assert out.logo_url == "https://example.com/logo.png"
    assert out.timezone == "Asia/Karachi"
    assert out.currency == "PKR"
