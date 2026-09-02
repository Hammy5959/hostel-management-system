"""Unit tests for the blacklist guard in visitor_logs.check_in.

No live DB: get_by_id is patched at the name it's bound to inside
app.visitor_logs.service, so `db` is never actually used and is passed as
None.
"""

from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

import pytest

from app.core.exceptions import ConflictError
from app.visitor_logs.schemas import VisitorLogCheckIn
from app.visitor_logs.service import check_in

USER = {"id": str(uuid4())}


def _visitor(*, is_blacklisted: bool, status: str) -> dict:
    return {"id": str(uuid4()), "status": status, "is_blacklisted": is_blacklisted}


def _payload() -> VisitorLogCheckIn:
    return VisitorLogCheckIn(visitor_id=uuid4())


@patch("app.visitor_logs.service.get_by_id")
def test_check_in_blocks_blacklisted_visitor(mock_get_by_id):
    mock_get_by_id.return_value = _visitor(is_blacklisted=True, status="expected")
    with pytest.raises(ConflictError) as exc:
        check_in(None, USER, _payload())
    assert exc.value.code == "visitor_blacklisted"


@patch("app.visitor_logs.service.get_by_id")
def test_check_in_blacklist_takes_precedence_over_already_checked_in(mock_get_by_id):
    # Both conditions true at once — the blacklist guard must win since it's
    # checked first, per the ordering the fix requires.
    mock_get_by_id.return_value = _visitor(is_blacklisted=True, status="checked_in")
    with pytest.raises(ConflictError) as exc:
        check_in(None, USER, _payload())
    assert exc.value.code == "visitor_blacklisted"


@patch("app.visitor_logs.service.get_by_id")
def test_check_in_still_blocks_already_checked_in_when_not_blacklisted(mock_get_by_id):
    mock_get_by_id.return_value = _visitor(is_blacklisted=False, status="checked_in")
    with pytest.raises(ConflictError) as exc:
        check_in(None, USER, _payload())
    assert exc.value.code == "already_checked_in"


@patch("app.visitor_logs.service.raise_for_error")
@patch("app.visitor_logs.service.get_by_id")
def test_check_in_allows_non_blacklisted_not_checked_in(mock_get_by_id, mock_raise_for_error):
    mock_get_by_id.return_value = _visitor(is_blacklisted=False, status="expected")

    class _FakeResult:
        error = None
        data = [{
            "id": str(uuid4()),
            "visitor_id": str(uuid4()),
            "check_in_at": "2026-09-02T00:00:00+00:00",
            "check_out_at": None,
            "checked_in_by": USER["id"],
            "checked_out_by": None,
            "remarks": None,
            "created_at": "2026-09-02T00:00:00+00:00",
        }]

    class _FakeTable:
        def insert(self, _payload):
            return self

        def update(self, _payload):
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def execute(self):
            return _FakeResult()

    class _FakeDb:
        def table(self, _name):
            return _FakeTable()

    result = check_in(_FakeDb(), USER, _payload())
    assert str(result.checked_in_by) == USER["id"]
    mock_raise_for_error.assert_not_called()
