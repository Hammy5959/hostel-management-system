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


def test_request_otp_rejects_weak_password(client):
    for weak in ("short", "abcdefgh", "abcd1234"):
        res = client.post("/api/v1/auth/request-otp", json={"email": "a@example.com", "password": weak})
        assert res.status_code == 422, (weak, res.text)


def test_verify_otp_validates_otp_presence(client):
    res = client.post("/api/v1/auth/verify-otp", json={"email": "a@example.com"})
    assert res.status_code == 422


def test_me_requires_token(client):
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401
