"""API surface tests that do not require database access."""

from __future__ import annotations


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_openapi_available(client):
    res = client.get("/openapi.json")
    assert res.status_code == 200
    assert "paths" in res.json()


def test_protected_route_returns_401_envelope(client):
    res = client.get("/api/v1/users")
    assert res.status_code == 401
    body = res.json()["detail"]
    assert body["code"] == "missing_token"


def test_unknown_route_returns_404_envelope(client):
    res = client.get("/api/v1/does-not-exist")
    assert res.status_code == 404
    assert res.json()["detail"]["code"] == "not_found"


def test_request_otp_validates_email(client):
    res = client.post("/api/v1/auth/request-otp", json={"email": "not-an-email", "password": "Valid#Pass1"})
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "validation_error"


def test_request_otp_requires_password(client):
    res = client.post("/api/v1/auth/request-otp", json={"email": "a@example.com"})
    assert res.status_code == 422
    assert res.json()["detail"]["code"] == "validation_error"


def test_request_otp_never_rejects_password_for_its_format(client):
    """Regression test: the password-creation complexity policy (min length,
    a digit, a special character) must never apply on login — only a
    correct-vs-incorrect credential check. These passwords all violate that
    policy but must still reach the credential check (here resolving to the
    same 401 as any other login failure) instead of a 422."""
    for weak in ("short", "abcdefgh", "abcd1234"):
        res = client.post("/api/v1/auth/request-otp", json={"email": "a@example.com", "password": weak})
        assert res.status_code == 401, (weak, res.text)
        body = res.json()["detail"]
        assert body["code"] == "invalid_credentials"
        assert body["message"] == "Incorrect email or password"


def test_verify_otp_validates_otp_presence(client):
    res = client.post("/api/v1/auth/verify-otp", json={"email": "a@example.com"})
    assert res.status_code == 422


def test_me_requires_token(client):
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401


def test_public_branding_needs_no_auth_and_exposes_only_name_and_logo(client):
    """GET /hostel-settings/branding backs the pre-login pages, so it must
    work without a token and must never leak the other settings fields."""
    from datetime import datetime, timezone
    from unittest.mock import patch
    from uuid import uuid4

    from app.api.deps import get_db
    from app.hostel_settings.schemas import HostelSettingsOut

    now = datetime.now(timezone.utc)
    current = HostelSettingsOut(
        id=uuid4(), hostel_name="Al-Fateh Hostel", logo_url="https://example.com/logo.png",
        email="office@example.com", phone="0300", address="Street 1", primary_color="#0f766e",
        created_at=now, updated_at=now,
    )
    client.app.dependency_overrides[get_db] = lambda: None
    try:
        with patch("app.hostel_settings.service.get_current", return_value=current):
            res = client.get("/api/v1/hostel-settings/branding")
    finally:
        client.app.dependency_overrides.pop(get_db, None)

    assert res.status_code == 200
    assert res.json() == {
        "hostel_name": "Al-Fateh Hostel",
        "logo_url": "https://example.com/logo.png",
        "primary_color": "#0f766e",
    }


def test_hostel_settings_current_still_requires_auth(client):
    res = client.get("/api/v1/hostel-settings/current")
    assert res.status_code == 401
