"""Unit test for the invoice-issued notify hook in
app.invoices.service.issue_invoice (Fix 2).
"""

from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

from app.invoices.service import issue_invoice


def _invoice_row(**overrides) -> dict:
    now = "2026-09-05T00:00:00+00:00"
    row = {
        "id": str(uuid4()),
        "resident_id": str(uuid4()),
        "invoice_number": "INV-0001",
        "issue_date": "2026-09-05",
        "due_date": "2026-09-20",
        "subtotal": "100.00",
        "discount": "0",
        "total_amount": "100.00",
        "status": "draft",
        "notes": None,
        "created_by": str(uuid4()),
        "created_at": now,
        "updated_at": now,
    }
    row.update(overrides)
    return row


class _FakeResult:
    error = None


class _FakeTable:
    def update(self, _payload):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        return _FakeResult()


class _FakeDb:
    def table(self, _name):
        return _FakeTable()


@patch("app.invoices.service.notify_resident")
@patch("app.invoices.service._fetch")
def test_issue_invoice_notifies_resident(mock_fetch, mock_notify_resident):
    draft = _invoice_row(status="draft")
    issued = _invoice_row(id=draft["id"], resident_id=draft["resident_id"], status="issued")
    mock_fetch.side_effect = [draft, issued]

    result = issue_invoice(_FakeDb(), draft["id"])

    mock_notify_resident.assert_called_once()
    args, kwargs = mock_notify_resident.call_args
    assert args[1] == issued["resident_id"]
    assert kwargs["reference_type"] == "invoice"
    assert kwargs["reference_id"] == issued["id"]
    assert result.status == "issued"
