"""Unit tests for audit coverage in app.expenses.service.update."""

from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

from app.expenses.schemas import ExpenseUpdate
from app.expenses.service import update


def _expense_row(**overrides) -> dict:
    row = {
        "id": str(uuid4()),
        "expense_number": "EXP-0001",
        "category": "utilities",
        "description": "Electricity bill",
        "amount": "500.00",
        "expense_date": "2026-09-01",
        "vendor": None,
        "payment_method": None,
        "receipt_url": None,
        "created_by": str(uuid4()),
        "created_at": "2026-09-01T00:00:00+00:00",
        "updated_at": "2026-09-01T00:00:00+00:00",
    }
    row.update(overrides)
    return row


@patch("app.expenses.service.record_audit")
@patch("app.expenses.service.db_update")
@patch("app.expenses.service.get_by_id")
def test_update_records_audit_with_old_and_new_values(mock_get_by_id, mock_db_update, mock_record_audit):
    user = {"id": str(uuid4())}
    existing = _expense_row(category="utilities", amount="500.00")
    updated_row = _expense_row(id=existing["id"], category="maintenance", amount="750.00")
    mock_get_by_id.return_value = existing
    mock_db_update.return_value = updated_row

    result = update(None, user, existing["id"], ExpenseUpdate(category="maintenance", amount="750.00"))

    mock_record_audit.assert_called_once()
    kwargs = mock_record_audit.call_args.kwargs
    assert kwargs["action"] == "expense.update"
    assert kwargs["user_id"] == user["id"]
    assert kwargs["old_values"] == {"category": "utilities", "amount": "500.00"}
    assert kwargs["new_values"]["category"] == "maintenance"
    assert result.category == "maintenance"


@patch("app.expenses.service.record_audit")
@patch("app.expenses.service.db_update")
@patch("app.expenses.service.get_by_id")
def test_update_with_no_fields_skips_audit(mock_get_by_id, mock_db_update, mock_record_audit):
    user = {"id": str(uuid4())}
    existing = _expense_row()
    mock_get_by_id.return_value = existing
    mock_db_update.return_value = existing

    update(None, user, existing["id"], ExpenseUpdate())

    mock_record_audit.assert_not_called()
