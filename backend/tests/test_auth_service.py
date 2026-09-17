"""Unit tests for app.auth.service: failed-login audit coverage (login.failed)
and ip_address/user_agent forwarding into record_audit for both the failure
and success paths.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from app.auth.service import request_otp, verify_otp
from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError


def _user_row(**overrides) -> dict:
    row = {
        "id": str(uuid4()),
        "email": "a@example.com",
        "status": "active",
        "password_hash": "hashed",
        "role_id": str(uuid4()),
        "first_name": "Ada",
        "last_name": None,
        "phone": None,
        "profile_picture_url": None,
        "email_verified": True,
        "last_login_at": None,
        "created_at": "2026-09-01T00:00:00+00:00",
        "updated_at": "2026-09-01T00:00:00+00:00",
    }
    row.update(overrides)
    return row


@patch("app.auth.service.record_audit")
@patch("app.auth.service.get_user_by_email")
def test_request_otp_unknown_email_records_login_failed_with_null_user_id(mock_get_user, mock_record_audit):
    mock_get_user.return_value = None

    try:
        request_otp(None, "nobody@example.com", "whatever", ip_address="1.2.3.4", user_agent="pytest")
        assert False, "expected NotFoundError"
    except NotFoundError:
        pass

    mock_record_audit.assert_called_once()
    kwargs = mock_record_audit.call_args.kwargs
    assert kwargs["action"] == "login.failed"
    assert kwargs["user_id"] is None
    assert kwargs["new_values"]["email"] == "nobody@example.com"
    assert kwargs["new_values"]["reason"] == "user_not_found"
    assert kwargs["ip_address"] == "1.2.3.4"
    assert kwargs["user_agent"] == "pytest"
    # Never logs the attempted password.
    assert "whatever" not in str(kwargs)
    assert "password" not in kwargs["description"].lower()


@patch("app.auth.service.verify_password")
@patch("app.auth.service.record_audit")
@patch("app.auth.service.get_user_by_email")
def test_request_otp_wrong_password_resolves_user_id(mock_get_user, mock_record_audit, mock_verify_password):
    user = _user_row()
    mock_get_user.return_value = user
    mock_verify_password.return_value = False

    try:
        request_otp(None, user["email"], "wrong-password", ip_address="1.2.3.4", user_agent="pytest")
        assert False, "expected UnauthorizedError"
    except UnauthorizedError:
        pass

    mock_record_audit.assert_called_once()
    kwargs = mock_record_audit.call_args.kwargs
    assert kwargs["action"] == "login.failed"
    assert kwargs["user_id"] == user["id"]
    assert kwargs["new_values"]["reason"] == "invalid_credentials"
    assert "wrong-password" not in str(kwargs)
    assert "password" not in kwargs["description"].lower()


@patch("app.auth.service.record_audit")
@patch("app.auth.service.get_user_by_email")
def test_request_otp_inactive_account_records_login_failed(mock_get_user, mock_record_audit):
    user = _user_row(status="pending")
    mock_get_user.return_value = user

    try:
        request_otp(None, user["email"], "irrelevant", ip_address=None, user_agent=None)
        assert False, "expected ForbiddenError"
    except ForbiddenError:
        pass

    kwargs = mock_record_audit.call_args.kwargs
    assert kwargs["new_values"]["reason"] == "account_inactive"
    assert kwargs["user_id"] == user["id"]
    assert "password" not in kwargs["description"].lower()


@patch("app.auth.service._store")
@patch("app.auth.service.record_audit")
@patch("app.auth.service.get_user_by_email")
def test_verify_otp_bad_otp_records_login_failed(mock_get_user, mock_record_audit, mock_store):
    user = _user_row()
    mock_get_user.return_value = user
    mock_store.consume_attempt.return_value = (False, "invalid")

    try:
        verify_otp(None, user["email"], "000000", ip_address="9.9.9.9", user_agent="pytest-ua")
        assert False, "expected BadRequestError"
    except BadRequestError:
        pass

    mock_record_audit.assert_called_once()
    kwargs = mock_record_audit.call_args.kwargs
    assert kwargs["action"] == "login.failed"
    assert kwargs["user_id"] == user["id"]
    assert kwargs["new_values"]["reason"] == "otp_invalid"
    assert kwargs["ip_address"] == "9.9.9.9"
    assert kwargs["user_agent"] == "pytest-ua"
    assert "000000" not in str(kwargs)
    assert "password" not in kwargs["description"].lower()


@patch("app.auth.service.get_hostel_settings")
@patch("app.auth.service.get_role_name")
@patch("app.auth.service.get_user_permissions")
@patch("app.auth.service.create_access_token")
@patch("app.auth.service.mark_user_authenticated")
@patch("app.auth.service._store")
@patch("app.auth.service.record_audit")
@patch("app.auth.service.get_user_by_email")
def test_verify_otp_success_records_login_with_ip_and_ua(
    mock_get_user, mock_record_audit, mock_store, mock_mark_authenticated,
    mock_create_token, mock_get_permissions, mock_get_role_name, mock_get_hostel_settings,
):
    user = _user_row()
    mock_get_user.return_value = user
    mock_store.consume_attempt.return_value = (True, "ok")
    mock_mark_authenticated.return_value = user
    mock_create_token.return_value = "jwt-token"
    mock_get_permissions.return_value = set()
    mock_get_role_name.return_value = "warden"
    mock_get_hostel_settings.return_value = SimpleNamespace(
        hostel_name="Test Hostel", logo_url=None, timezone="Asia/Karachi", currency="PKR",
    )

    result = verify_otp(None, user["email"], "123456", ip_address="5.5.5.5", user_agent="pytest-ua")

    mock_record_audit.assert_called_once()
    kwargs = mock_record_audit.call_args.kwargs
    assert kwargs["action"] == "login"
    assert kwargs["user_id"] == user["id"]
    assert kwargs["ip_address"] == "5.5.5.5"
    assert kwargs["user_agent"] == "pytest-ua"
    assert kwargs["description"] == "Ada logged in"
    assert "password" not in kwargs["description"].lower()
    assert result.branding.hostel_name == "Test Hostel"
    assert result.branding.currency == "PKR"
