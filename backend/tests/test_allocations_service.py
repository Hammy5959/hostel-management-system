"""Unit tests for the new, permission-free internal location-resolution
helpers in app.allocations.service (get_resident_location,
list_resident_ids_by_location), added for notices' audience targeting.

These call db.table(...) directly (no crud helper), so tests build a small
fake PostgREST-style chain rather than patching a named function — same
style as test_visitor_logs_service.py's _FakeDb/_FakeTable/_FakeResult.
"""

from __future__ import annotations

from app.allocations.service import get_resident_location, list_resident_ids_by_location


class _FakeResult:
    def __init__(self, data):
        self.data = data
        self.error = None


class _FakeQuery:
    def __init__(self, data):
        self._data = data

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        return _FakeResult(self._data)


class _FakeDb:
    def __init__(self, data):
        self._data = data

    def table(self, _name):
        return _FakeQuery(self._data)


def test_get_resident_location_returns_none_none_when_no_active_allocation():
    building_id, floor_id = get_resident_location(_FakeDb([]), "resident-1")
    assert (building_id, floor_id) == (None, None)


def test_get_resident_location_returns_building_and_floor():
    row = {"room": {"floors": {"id": "floor-1", "building_id": "building-1"}}}
    building_id, floor_id = get_resident_location(_FakeDb([row]), "resident-1")
    assert building_id == "building-1"
    assert floor_id == "floor-1"


def test_list_resident_ids_by_location_returns_matching_resident_ids():
    rows = [
        {"resident_id": "r1", "room": {"floors": {"id": "floor-1", "building_id": "building-1"}}},
        {"resident_id": "r2", "room": {"floors": {"id": "floor-2", "building_id": "building-1"}}},
    ]
    result = list_resident_ids_by_location(_FakeDb(rows), building_id="building-1")
    assert result == ["r1", "r2"]


def test_list_resident_ids_by_location_returns_empty_list_when_none_found():
    result = list_resident_ids_by_location(_FakeDb([]), floor_id="floor-1")
    assert result == []
