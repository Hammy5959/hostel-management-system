"""Unit tests for GET /audit-logs: the actor name embed resolves onto
AuditLogOut.actor, and a NULL user_id (system/unattributed action) degrades
gracefully to actor=None instead of erroring.

Query parameters with FastAPI `Query(...)` defaults are passed explicitly
here (rather than relying on the function's defaults) since calling a route
handler directly, outside of FastAPI's dependency injection, would otherwise
bind them to unresolved `Query` marker objects instead of plain values.
"""

from __future__ import annotations

from unittest.mock import patch
from uuid import uuid4

from app.audit.routes import list_audit_logs


def _log_row(**overrides) -> dict:
    user_id = str(uuid4())
    row = {
        "id": str(uuid4()),
        "user_id": user_id,
        "action": "user.create",
        "module": "users",
        "entity_type": "user",
        "entity_id": str(uuid4()),
        "description": "Created user a@example.com",
        "old_values": None,
        "new_values": {"email": "a@example.com"},
        "ip_address": "127.0.0.1",
        "user_agent": "pytest",
        "created_at": "2026-09-05T00:00:00+00:00",
        "actor": {"id": user_id, "first_name": "Ada", "last_name": None, "email": "a@example.com"},
    }
    row.update(overrides)
    return row


def _call(**overrides):
    kwargs = dict(
        page=1, per_page=20, action=None, module=None, entity_type=None,
        user_id=None, date_from=None, date_to=None, db=None,
    )
    kwargs.update(overrides)
    return list_audit_logs(**kwargs)


@patch("app.audit.routes.list_page")
def test_list_audit_logs_uses_actor_embed_select(mock_list_page):
    mock_list_page.return_value = ([_log_row()], 1)

    _call()

    assert mock_list_page.call_args.kwargs["select"] == "*, actor:users(id, first_name, last_name, email)"


@patch("app.audit.routes.list_page")
def test_list_audit_logs_resolves_actor_name(mock_list_page):
    row = _log_row()
    mock_list_page.return_value = ([row], 1)

    result = _call()

    assert result.items[0].actor is not None
    assert result.items[0].actor.first_name == "Ada"
    assert result.items[0].actor.email == "a@example.com"


@patch("app.audit.routes.list_page")
def test_list_audit_logs_null_user_id_has_no_actor(mock_list_page):
    row = _log_row(user_id=None, actor=None)
    mock_list_page.return_value = ([row], 1)

    result = _call()

    assert result.items[0].user_id is None
    assert result.items[0].actor is None
