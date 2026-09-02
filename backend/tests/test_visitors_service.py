"""Unit tests for the guest ownership guard in create_visitor.

No live DB: every DB-touching call the guard depends on is patched at the
name it's bound to inside app.visitors.service (not at its original
definition site), so `db` is never actually used and is passed as None.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch
from uuid import uuid4

import pytest

from app.core.exceptions import ConflictError, ForbiddenError
from app.visitors.schemas import VisitorCreate
from app.visitors.service import cancel_visitor, create_visitor

RESIDENT_ID = uuid4()
OTHER_RESIDENT_ID = uuid4()
VISITOR_ID = uuid4()
USER = {"id": str(uuid4())}


def _data(resident_id=RESIDENT_ID) -> VisitorCreate:
    return VisitorCreate(resident_id=resident_id, visitor_name="Jane Doe")


def _inserted_row(resident_id) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": str(uuid4()),
        "resident_id": str(resident_id),
        "visitor_name": "Jane Doe",
        "visitor_phone": None,
        "relationship": None,
        "identification_type": None,
        "identification_number": None,
        "purpose": None,
        "expected_at": None,
        "status": "expected",
        "is_blacklisted": False,
        "created_by": USER["id"],
        "created_at": now,
        "updated_at": now,
    }


@patch("app.visitors.service.get_resident_by_user", return_value=None)
@patch("app.visitors.service.has_permission", return_value=False)
@patch("app.visitors.service.get_by_id", return_value={"id": str(RESIDENT_ID)})
def test_create_visitor_blocks_when_no_own_resident_profile(mock_get_by_id, mock_has_perm, mock_own):
    with pytest.raises(ForbiddenError) as exc:
        create_visitor(None, USER, _data())
    assert exc.value.code == "not_your_resident"


@patch("app.visitors.service.get_resident_by_user", return_value={"id": str(OTHER_RESIDENT_ID)})
@patch("app.visitors.service.has_permission", return_value=False)
@patch("app.visitors.service.get_by_id", return_value={"id": str(RESIDENT_ID)})
def test_create_visitor_blocks_when_resident_id_mismatch(mock_get_by_id, mock_has_perm, mock_own):
    with pytest.raises(ForbiddenError) as exc:
        create_visitor(None, USER, _data(resident_id=RESIDENT_ID))
    assert exc.value.code == "not_your_resident"


@patch("app.visitors.service.insert")
@patch("app.visitors.service.get_resident_by_user", return_value={"id": str(RESIDENT_ID)})
@patch("app.visitors.service.has_permission", return_value=False)
@patch("app.visitors.service.get_by_id", return_value={"id": str(RESIDENT_ID), "status": "active"})
def test_create_visitor_allows_own_resident(mock_get_by_id, mock_has_perm, mock_own, mock_insert):
    mock_insert.return_value = _inserted_row(RESIDENT_ID)
    result = create_visitor(None, USER, _data(resident_id=RESIDENT_ID))
    assert result.status == "expected"
    mock_own.assert_called_once()
    mock_insert.assert_called_once()


@patch("app.visitors.service.insert")
@patch("app.visitors.service.get_resident_by_user")
@patch("app.visitors.service.has_permission", return_value=True)
@patch("app.visitors.service.get_by_id", return_value={"id": str(OTHER_RESIDENT_ID), "status": "active"})
def test_create_visitor_staff_bypasses_ownership_check(mock_get_by_id, mock_has_perm, mock_own, mock_insert):
    mock_insert.return_value = _inserted_row(OTHER_RESIDENT_ID)
    result = create_visitor(None, USER, _data(resident_id=OTHER_RESIDENT_ID))
    assert result.status == "expected"
    mock_own.assert_not_called()


@patch("app.visitors.service.get_resident_by_user")
@patch("app.visitors.service.has_permission", return_value=True)
@patch("app.visitors.service.get_by_id", return_value={"id": str(RESIDENT_ID), "status": "checked_out"})
def test_create_visitor_blocks_checked_out_resident(mock_get_by_id, mock_has_perm, mock_own):
    with pytest.raises(ConflictError) as exc:
        create_visitor(None, USER, _data(resident_id=RESIDENT_ID))
    assert exc.value.code == "resident_not_active"


@patch("app.visitors.service.insert")
@patch("app.visitors.service.get_resident_by_user")
@patch("app.visitors.service.has_permission", return_value=True)
@patch("app.visitors.service.get_by_id", return_value={"id": str(RESIDENT_ID), "status": "active"})
def test_create_visitor_allows_active_resident(mock_get_by_id, mock_has_perm, mock_own, mock_insert):
    mock_insert.return_value = _inserted_row(RESIDENT_ID)
    result = create_visitor(None, USER, _data(resident_id=RESIDENT_ID))
    assert result.status == "expected"


@patch("app.visitors.service.insert")
@patch("app.visitors.service.get_resident_by_user")
@patch("app.visitors.service.has_permission", return_value=True)
@patch("app.visitors.service.get_by_id", return_value={"id": str(RESIDENT_ID), "status": "on_leave"})
def test_create_visitor_allows_on_leave_resident(mock_get_by_id, mock_has_perm, mock_own, mock_insert):
    mock_insert.return_value = _inserted_row(RESIDENT_ID)
    result = create_visitor(None, USER, _data(resident_id=RESIDENT_ID))
    assert result.status == "expected"


@patch("app.visitors.service.update")
@patch(
    "app.visitors.service.get_by_id",
    return_value={**_inserted_row(RESIDENT_ID), "id": str(VISITOR_ID), "status": "expected"},
)
def test_cancel_visitor_succeeds_when_expected(mock_get_by_id, mock_update):
    mock_update.return_value = {**_inserted_row(RESIDENT_ID), "id": str(VISITOR_ID), "status": "cancelled"}
    result = cancel_visitor(None, str(VISITOR_ID))
    assert result.status == "cancelled"


@patch(
    "app.visitors.service.get_by_id",
    return_value={**_inserted_row(RESIDENT_ID), "id": str(VISITOR_ID), "status": "checked_in"},
)
def test_cancel_visitor_blocks_when_not_expected(mock_get_by_id):
    with pytest.raises(ConflictError) as exc:
        cancel_visitor(None, str(VISITOR_ID))
    assert exc.value.code == "cannot_cancel"
