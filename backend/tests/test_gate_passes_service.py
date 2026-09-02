"""Unit tests for the ownership guard in gate_passes.service.cancel.

No live DB: every DB-touching call the guard depends on is patched at the
name it's bound to inside app.gate_passes.service, so `db` is never actually
used and is passed as None.
"""

from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

import pytest

from app.core.exceptions import ConflictError, ForbiddenError
from app.gate_passes.service import cancel

RESIDENT_ID = uuid4()
OTHER_RESIDENT_ID = uuid4()
USER = {"id": str(uuid4())}
PASS_ID = str(uuid4())


def _pass_row(*, status: str, resident_id=RESIDENT_ID) -> dict:
    now = "2026-09-02T00:00:00+00:00"
    return {
        "id": PASS_ID,
        "resident_id": str(resident_id),
        "pass_number": "GP-0001",
        "reason": "Family visit",
        "destination": None,
        "departure_at": None,
        "expected_return_at": None,
        "actual_return_at": None,
        "status": status,
        "requested_at": now,
        "approved_by": None,
        "approved_at": None,
        "issued_by": None,
        "issued_at": None,
        "verified_by": None,
        "notes": None,
        "created_at": now,
        "updated_at": now,
    }


@patch("app.gate_passes.service.get_resident_by_user", return_value=None)
@patch("app.gate_passes.service.has_permission", return_value=False)
@patch("app.gate_passes.service._fetch", return_value=_pass_row(status="pending"))
def test_cancel_blocks_when_no_own_resident_profile(mock_fetch, mock_has_perm, mock_own):
    with pytest.raises(ForbiddenError) as exc:
        cancel(None, USER, PASS_ID)
    assert exc.value.code == "not_your_pass"


@patch("app.gate_passes.service.get_resident_by_user", return_value={"id": str(OTHER_RESIDENT_ID)})
@patch("app.gate_passes.service.has_permission", return_value=False)
@patch("app.gate_passes.service._fetch", return_value=_pass_row(status="pending", resident_id=RESIDENT_ID))
def test_cancel_blocks_resident_id_mismatch(mock_fetch, mock_has_perm, mock_own):
    with pytest.raises(ForbiddenError) as exc:
        cancel(None, USER, PASS_ID)
    assert exc.value.code == "not_your_pass"


@patch("app.gate_passes.service.update")
@patch("app.gate_passes.service.get_resident_by_user", return_value={"id": str(RESIDENT_ID)})
@patch("app.gate_passes.service.has_permission", return_value=False)
@patch("app.gate_passes.service._fetch", return_value=_pass_row(status="pending", resident_id=RESIDENT_ID))
def test_cancel_allows_own_pass(mock_fetch, mock_has_perm, mock_own, mock_update):
    mock_update.return_value = _pass_row(status="cancelled", resident_id=RESIDENT_ID)
    result = cancel(None, USER, PASS_ID)
    assert result.status == "cancelled"
    mock_own.assert_called_once()


@patch("app.gate_passes.service.update")
@patch("app.gate_passes.service.get_resident_by_user")
@patch("app.gate_passes.service.has_permission", return_value=True)
@patch("app.gate_passes.service._fetch", return_value=_pass_row(status="approved", resident_id=OTHER_RESIDENT_ID))
def test_cancel_staff_bypasses_ownership_check(mock_fetch, mock_has_perm, mock_own, mock_update):
    mock_update.return_value = _pass_row(status="cancelled", resident_id=OTHER_RESIDENT_ID)
    result = cancel(None, USER, PASS_ID)
    assert result.status == "cancelled"
    mock_own.assert_not_called()


@patch("app.gate_passes.service.has_permission", return_value=True)
@patch("app.gate_passes.service._fetch", return_value=_pass_row(status="issued", resident_id=RESIDENT_ID))
def test_cancel_still_blocks_invalid_state(mock_fetch, mock_has_perm):
    # Staff (ownership bypassed), but the pass is past the cancellable window —
    # the pre-existing state guard must still fire.
    with pytest.raises(ConflictError) as exc:
        cancel(None, USER, PASS_ID)
    assert exc.value.code == "invalid_transition"
