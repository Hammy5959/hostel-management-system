"""Unit test for the invoice-issued notify hook in
app.invoices.service.issue_invoice (Fix 2).
"""

from __future__ import annotations

from decimal import Decimal
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


@patch("app.invoices.service.record_audit")
@patch("app.invoices.service.notify_resident")
@patch("app.invoices.service._fetch")
def test_issue_invoice_notifies_resident(mock_fetch, mock_notify_resident, mock_record_audit):
    user = {"id": str(uuid4())}
    draft = _invoice_row(status="draft")
    issued = _invoice_row(id=draft["id"], resident_id=draft["resident_id"], status="issued")
    mock_fetch.side_effect = [draft, issued]

    result = issue_invoice(_FakeDb(), user, draft["id"])

    mock_notify_resident.assert_called_once()
    args, kwargs = mock_notify_resident.call_args
    assert args[1] == issued["resident_id"]
    assert kwargs["reference_type"] == "invoice"
    assert kwargs["reference_id"] == issued["id"]
    assert result.status == "issued"

    mock_record_audit.assert_called_once()
    assert mock_record_audit.call_args.kwargs["action"] == "invoice.issue"
    assert mock_record_audit.call_args.kwargs["user_id"] == user["id"]


@patch("app.invoices.service.record_audit")
@patch("app.invoices.service._fetch")
def test_update_invoice_audits_changed_fields(mock_fetch, mock_record_audit):
    user = {"id": str(uuid4())}
    invoice = _invoice_row(status="draft", discount="0", total_amount="100.00")
    updated = _invoice_row(id=invoice["id"], status="draft", discount="10", total_amount="90.00")
    mock_fetch.side_effect = [invoice, updated]

    from app.invoices.schemas import InvoiceUpdate
    from app.invoices.service import update_invoice

    result = update_invoice(_FakeDb(), user, invoice["id"], InvoiceUpdate(discount="10"))

    mock_record_audit.assert_called_once()
    kwargs = mock_record_audit.call_args.kwargs
    assert kwargs["action"] == "invoice.update"
    assert kwargs["user_id"] == user["id"]
    assert kwargs["old_values"]["discount"] == "0"
    assert kwargs["new_values"]["discount"] == "10"
    assert result.status == "draft"


@patch("app.invoices.service.record_audit")
@patch("app.invoices.service._fetch")
def test_cancel_invoice_records_audit(mock_fetch, mock_record_audit):
    user = {"id": str(uuid4())}
    invoice = _invoice_row(status="issued")
    invoice["amount_paid"] = Decimal("0")
    cancelled = _invoice_row(id=invoice["id"], status="cancelled")
    mock_fetch.side_effect = [invoice, cancelled]

    from app.invoices.service import cancel_invoice

    class _FakeChargesTable:
        def update(self, _payload):
            return self

        def eq(self, *_args, **_kwargs):
            return self

        def execute(self):
            return _FakeResult()

    class _FakeCancelDb:
        def table(self, name):
            return _FakeTable() if name == "invoices" else _FakeChargesTable()

    result = cancel_invoice(_FakeCancelDb(), user, invoice["id"])

    mock_record_audit.assert_called_once()
    kwargs = mock_record_audit.call_args.kwargs
    assert kwargs["action"] == "invoice.cancel"
    assert kwargs["user_id"] == user["id"]
    assert kwargs["old_values"] == {"status": "issued"}
    assert result.status == "cancelled"
