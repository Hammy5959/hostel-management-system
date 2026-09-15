"""Unit tests for app.reports.service — mocked DB, no real Supabase client.

Covers only the highest-risk new/changed logic (per project scoping): the
overdue_invoices fix (regression guard for the 'overdue' status never being
set), the defaulters() RPC pass-through, and the occupancy() building/floor
breakdown. Everything else in reports/service.py is a thin _count/_counts_by
wrapper not judged to need its own unit test.
"""

from __future__ import annotations

from datetime import date
from unittest.mock import patch

from app.reports.service import _count_overdue_invoices, _occupancy_breakdown, defaulters


class _FakeResult:
    def __init__(self, count=0, data=None, error=None):
        self.count = count
        self.data = data
        self.error = error


class _FakeQuery:
    """Records every chained call so a test can assert on the exact filters
    applied, mirroring the .select()/.eq()/.in_()/.lt()/.gte()/.lte()/.execute()
    chain app.reports.service._count and _count_overdue_invoices build."""

    def __init__(self, result: _FakeResult):
        self._result = result
        self.calls: list[tuple[str, tuple, dict]] = []

    def select(self, *args, **kwargs):
        self.calls.append(("select", args, kwargs))
        return self

    def eq(self, *args, **kwargs):
        self.calls.append(("eq", args, kwargs))
        return self

    def in_(self, *args, **kwargs):
        self.calls.append(("in_", args, kwargs))
        return self

    def gte(self, *args, **kwargs):
        self.calls.append(("gte", args, kwargs))
        return self

    def lte(self, *args, **kwargs):
        self.calls.append(("lte", args, kwargs))
        return self

    def lt(self, *args, **kwargs):
        self.calls.append(("lt", args, kwargs))
        return self

    def execute(self):
        return self._result


class _FakeDb:
    def __init__(self, result: _FakeResult):
        self._result = result
        self.query: _FakeQuery | None = None
        self.table_name: str | None = None

    def table(self, name):
        self.table_name = name
        self.query = _FakeQuery(self._result)
        return self.query


# ── overdue_invoices fix ────────────────────────────────────────────────────


def test_count_overdue_invoices_filters_on_status_in_and_due_date_lt():
    """Regression guard for the original bug: the count must come from
    status IN ('issued', 'partially_paid') AND due_date < today — never a
    literal status = 'overdue' match, since that status is never set by any
    code path (see app.invoices.service.get_earliest_outstanding_invoice_by_resident's
    docstring)."""
    today = date(2026, 9, 15)
    fake_db = _FakeDb(_FakeResult(count=3))

    result = _count_overdue_invoices(fake_db, today)

    assert result == 3
    assert fake_db.table_name == "invoices"
    call_names = [name for name, _, _ in fake_db.query.calls]
    assert "in_" in call_names
    assert "lt" in call_names
    in_call = next(c for c in fake_db.query.calls if c[0] == "in_")
    lt_call = next(c for c in fake_db.query.calls if c[0] == "lt")
    assert in_call[1] == ("status", ["issued", "partially_paid"])
    assert lt_call[1] == ("due_date", "2026-09-15")
    # Never filters on the literal (never-set) 'overdue' status value.
    eq_calls = [c for c in fake_db.query.calls if c[0] == "eq"]
    assert all(c[1] != ("status", "overdue") for c in eq_calls)


def test_count_overdue_invoices_returns_zero_when_no_rows():
    fake_db = _FakeDb(_FakeResult(count=None))

    assert _count_overdue_invoices(fake_db, date(2026, 9, 15)) == 0


# ── defaulters() ─────────────────────────────────────────────────────────


@patch("app.reports.service.rpc_call")
def test_defaulters_passes_through_rpc_rows(mock_rpc_call):
    rows = [
        {
            "resident_id": "r1", "first_name": "Asha", "last_name": "Rao", "student_id": "S001",
            "room_number": "101", "bed_number": "A", "total_outstanding": 4500, "oldest_overdue_date": "2026-08-01",
        },
        {
            "resident_id": "r2", "first_name": "Bilal", "last_name": None, "student_id": "S002",
            "room_number": None, "bed_number": None, "total_outstanding": 1200, "oldest_overdue_date": "2026-09-01",
        },
    ]
    mock_rpc_call.return_value = rows

    result = defaulters(None)

    mock_rpc_call.assert_called_once_with(None, "hms_defaulters", {})
    assert result == {"items": rows, "total": 2}


@patch("app.reports.service.rpc_call")
def test_defaulters_empty_when_no_rows(mock_rpc_call):
    mock_rpc_call.return_value = []

    assert defaulters(None) == {"items": [], "total": 0}


# ── occupancy() building/floor breakdown ────────────────────────────────────


class _FakeTableResult:
    def __init__(self, data=None, error=None):
        self.data = data if data is not None else []
        self.error = error


class _FakeFilterableTable:
    """Simulates a PostgREST select().eq(...).execute() chain by actually
    filtering the given rows on each .eq() call, so tests exercise real
    filtering behavior rather than just recording call args."""

    def __init__(self, rows: list[dict]):
        self._rows = rows
        self._filters: dict = {}

    def select(self, *args, **kwargs):
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def execute(self):
        rows = [r for r in self._rows if all(r.get(k) == v for k, v in self._filters.items())]
        return _FakeTableResult(data=rows)


class _FakeDbTables:
    def __init__(self, tables: dict[str, list[dict]]):
        self._tables = tables

    def table(self, name):
        return _FakeFilterableTable(self._tables.get(name, []))


@patch("app.reports.service.rpc_call")
def test_occupancy_breakdown_no_filter_zero_fills_buildings_with_no_rooms(mock_rpc_call):
    # Building C has rooms but no stats row from the RPC — mirrors
    # app.buildings.service._with_occupancy's own "absent from RPC result"
    # behavior for buildings with zero rooms.
    mock_rpc_call.return_value = [
        {"building_id": "A", "total_rooms": 10, "total_capacity": 20, "total_beds": 20, "occupied_beds": 15},
        {"building_id": "B", "total_rooms": 5, "total_capacity": 10, "total_beds": 10, "occupied_beds": 10},
    ]
    fake_db = _FakeDbTables({
        "buildings": [
            {"id": "A", "name": "Building A", "type": "boys"},
            {"id": "B", "name": "Building B", "type": "girls"},
            {"id": "C", "name": "Building C", "type": "mixed"},
        ]
    })

    result = _occupancy_breakdown(fake_db, building_id=None, floor_id=None)

    mock_rpc_call.assert_called_once_with(fake_db, "hms_building_occupancy", {"p_building_id": None})
    assert len(result) == 3
    by_id = {r["building_id"]: r for r in result}
    assert by_id["A"]["occupancy_rate"] == 75.0
    assert by_id["B"]["occupancy_rate"] == 100.0
    assert by_id["C"]["total_beds"] == 0
    assert by_id["C"]["occupied_beds"] == 0
    assert by_id["C"]["occupancy_rate"] == 0.0


@patch("app.reports.service.rpc_call")
def test_occupancy_breakdown_building_id_scopes_floors_to_that_building(mock_rpc_call):
    # hms_floor_occupancy returns floors globally (p_floor_id=None) — the
    # Python-side filter/merge must narrow to only building B1's floors.
    mock_rpc_call.return_value = [
        {"floor_id": "F1", "total_rooms": 3, "total_capacity": 6, "total_beds": 6, "occupied_beds": 3},
        {"floor_id": "F2", "total_rooms": 2, "total_capacity": 4, "total_beds": 4, "occupied_beds": 4},
        {"floor_id": "F3", "total_rooms": 4, "total_capacity": 8, "total_beds": 8, "occupied_beds": 0},
    ]
    fake_db = _FakeDbTables({
        "floors": [
            {"id": "F1", "name": "Floor 1", "building_id": "B1"},
            {"id": "F2", "name": "Floor 2", "building_id": "B1"},
            {"id": "F3", "name": "Floor 3", "building_id": "B2"},
        ]
    })

    result = _occupancy_breakdown(fake_db, building_id="B1", floor_id=None)

    mock_rpc_call.assert_called_once_with(fake_db, "hms_floor_occupancy", {"p_floor_id": None})
    assert {r["floor_id"] for r in result} == {"F1", "F2"}
    assert all(r["building_id"] == "B1" for r in result)


@patch("app.reports.service.rpc_call")
def test_occupancy_breakdown_floor_id_returns_single_floor(mock_rpc_call):
    mock_rpc_call.return_value = [
        {"floor_id": "F1", "total_rooms": 3, "total_capacity": 6, "total_beds": 6, "occupied_beds": 3},
    ]
    fake_db = _FakeDbTables({
        "floors": [
            {"id": "F1", "name": "Floor 1", "building_id": "B1"},
            {"id": "F2", "name": "Floor 2", "building_id": "B1"},
        ]
    })

    result = _occupancy_breakdown(fake_db, building_id=None, floor_id="F1")

    mock_rpc_call.assert_called_once_with(fake_db, "hms_floor_occupancy", {"p_floor_id": "F1"})
    assert len(result) == 1
    assert result[0]["floor_id"] == "F1"
    assert result[0]["occupancy_rate"] == 50.0
