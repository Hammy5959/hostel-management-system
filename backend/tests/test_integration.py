"""Integration tests against the real Supabase database.

These require the database setup to be applied first:
  1. Run the two migrations in supabase/migrations/ (grants + RPC functions).
  2. Run the seeder:  uv run python -m app.seed.run

They create their own uniquely-suffixed records and remove them afterwards.
Enable with:  HMS_RUN_INTEGRATION=1 pytest tests/test_integration.py -v
"""

from __future__ import annotations

import os
import uuid

import pytest

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.environ.get("HMS_RUN_INTEGRATION") != "1",
        reason="set HMS_RUN_INTEGRATION=1 to run against the real database",
    ),
]

from decimal import Decimal  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

from app.auth.otp import get_otp_store  # noqa: E402
from app.core.passwords import hash_password  # noqa: E402
from app.database.supabase import get_supabase  # noqa: E402

SUFFIX = uuid.uuid4().hex[:8]
TEST_EMAIL = f"itest_{SUFFIX}@example.com"
# Meets the password policy (>=8 chars, number, special char).
TEST_PASSWORD = "Test#12345"

# Deletion order is FK-safe: children before parents.
_CLEANUP_ORDER = [
    "resident_stays",
    "invoice_items",
    "payments",
    "room_allocations",
    "admissions",
    "invoices",
    "beds",
    "rooms",
    "floors",
    "buildings",
    "residents",
]


@pytest.fixture(scope="module")
def db():
    return get_supabase()


@pytest.fixture(scope="module")
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def role_ids(db):
    res = db.table("roles").select("id, name").execute()
    return {r["name"]: r["id"] for r in res.data}


def _create_user(db, email: str, role_id: str, password: str = TEST_PASSWORD) -> str:
    res = db.table("users").insert({
        "email": email,
        "first_name": "IT",
        "last_name": "Test",
        "role_id": role_id,
        "status": "active",
        "password_hash": hash_password(password),
    }).execute()
    return res.data[0]["id"]


def _cleanup(db, user_ids: list[str], extra: dict):
    # Delete children before parents (FK-safe order).
    for table in _CLEANUP_ORDER:
        ids = extra.get(table)
        if ids:
            db.table(table).delete().in_("id", ids).execute()
    for uid in user_ids:
        db.table("users").delete().eq("id", uid).execute()


def _login(client, db, email: str, password: str = TEST_PASSWORD) -> str:
    r = client.post("/api/v1/auth/request-otp", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    otp = get_otp_store()._records[email.lower()].otp
    r = client.post("/api/v1/auth/verify-otp", json={"email": email, "otp": otp})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(client, token: str):
    return {"Authorization": f"Bearer {token}"}


# ── Authentication ────────────────────────────────────────────────────────────
def test_otp_login_and_me(client, db, role_ids):
    user_id = _create_user(db, TEST_EMAIL, role_ids["resident"])
    try:
        token = _login(client, db, TEST_EMAIL)
        res = client.get("/api/v1/auth/me", headers=_auth(client, token))
        assert res.status_code == 200
        assert res.json()["email"] == TEST_EMAIL

        # Invalid OTP must be rejected.
        r = client.post("/api/v1/auth/request-otp", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
        assert r.status_code == 200
        r = client.post("/api/v1/auth/verify-otp", json={"email": TEST_EMAIL, "otp": "000000"})
        assert r.status_code == 400
        assert r.json()["detail"]["code"] == "otp_invalid"
    finally:
        _cleanup(db, [user_id], {})


def test_unknown_email_request_otp(client, db):
    r = client.post("/api/v1/auth/request-otp", json={"email": f"nobody_{SUFFIX}@example.com", "password": TEST_PASSWORD})
    assert r.status_code == 404


# ── Password flow ─────────────────────────────────────────────────────────────
def test_wrong_password_rejected_and_no_jwt(client, db, role_ids):
    """Factor 1 (password) gates factor 2 (OTP): a wrong password must be
    rejected with 401 and must NOT create an OTP or a JWT."""
    email = f"pw_{SUFFIX}@example.com"
    user_id = _create_user(db, email, role_ids["resident"])
    try:
        r = client.post("/api/v1/auth/request-otp", json={"email": email, "password": "Wrong#1234"})
        assert r.status_code == 401, r.text
        assert r.json()["detail"]["code"] == "invalid_credentials"
        # No OTP record was created for the failed attempt.
        assert email not in get_otp_store()._records

        # A valid password issues an OTP but never a JWT.
        r = client.post("/api/v1/auth/request-otp", json={"email": email, "password": TEST_PASSWORD})
        assert r.status_code == 200, r.text
        assert "access_token" not in r.json()
        assert "user" not in r.json()
    finally:
        _cleanup(db, [user_id], {})


def test_no_password_hash_user_cannot_login(client, db, role_ids):
    """A legacy account with no password_hash set fails exactly like a wrong
    password — it never reveals that the account lacks a password."""
    email = f"nohash_{SUFFIX}@example.com"
    res = db.table("users").insert({
        "email": email,
        "first_name": "NoHash",
        "role_id": role_ids["resident"],
        "status": "active",
    }).execute()
    user_id = res.data[0]["id"]
    try:
        r = client.post("/api/v1/auth/request-otp", json={"email": email, "password": TEST_PASSWORD})
        assert r.status_code == 401
        assert r.json()["detail"]["code"] == "invalid_credentials"
    finally:
        _cleanup(db, [user_id], {})


def test_api_created_user_hashed_and_can_login(client, db, role_ids):
    """A user created via POST /users has its password Argon2id-hashed (never
    plaintext), the API response never leaks password fields, and the user can
    log in with the password they set."""
    admin_token = _login(client, db, "hamid59@gmail.com", "***REMOVED***")
    email = f"api_user_{SUFFIX}@example.com"
    r = client.post("/api/v1/users", headers=_auth(client, admin_token), json={
        "email": email, "first_name": "Api", "last_name": "User",
        "role_id": role_ids["resident"], "status": "active",
        "password": TEST_PASSWORD,
    })
    assert r.status_code == 201, r.text
    uid = r.json()["id"]
    # Response never leaks the password or its hash.
    body = r.json()
    assert "password" not in str(body)
    assert "password_hash" not in str(body)
    try:
        # Stored hash is Argon2id, not plaintext.
        row = db.table("users").select("password_hash").eq("id", uid).execute().data[0]
        assert (row["password_hash"] or "").startswith("$argon2id$")
        assert row["password_hash"] != TEST_PASSWORD
        # The user can log in with the password they set.
        token = _login(client, db, email, TEST_PASSWORD)
        assert token
    finally:
        _cleanup(db, [uid], {})


def test_super_admin_password_login(client, db):
    """The seeded super_admin must be able to log in with its initial password:
    Email + ***REMOVED*** -> OTP -> Dashboard."""
    email = "hamid59@gmail.com"
    r = client.post("/api/v1/auth/request-otp", json={"email": email, "password": "***REMOVED***"})
    assert r.status_code == 200, r.text
    otp = get_otp_store()._records[email].otp
    r = client.post("/api/v1/auth/verify-otp", json={"email": email, "otp": otp})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    # Super admin bypasses RBAC -> can reach the dashboard endpoint.
    res = client.get("/api/v1/users", headers=_auth(client, token))
    assert res.status_code == 200, res.text
    # Password fields are never returned anywhere.
    body = r.json()
    assert "password" not in str(body)
    assert "password_hash" not in str(body)


# ── RBAC ──────────────────────────────────────────────────────────────────────
def test_rbac_super_admin_vs_resident(client, db, role_ids):
    admin_id = _create_user(db, f"admin_{SUFFIX}@example.com", role_ids["super_admin"])
    resident_id = _create_user(db, f"resident_{SUFFIX}@example.com", role_ids["resident"])
    try:
        admin_token = _login(client, db, f"admin_{SUFFIX}@example.com")
        resident_token = _login(client, db, f"resident_{SUFFIX}@example.com")

        res = client.get("/api/v1/users", headers=_auth(client, admin_token))
        assert res.status_code == 200

        res = client.get("/api/v1/users", headers=_auth(client, resident_token))
        assert res.status_code == 403
        assert res.json()["detail"]["code"] == "missing_permission"
    finally:
        _cleanup(db, [admin_id, resident_id], {})


# ── Allocation: prevent double booking ───────────────────────────────────────
def test_allocation_double_booking_prevented(client, db, role_ids):
    staff_id = _create_user(db, f"warden_{SUFFIX}@example.com", role_ids["hostel_admin"])
    resident_id = _create_user(db, f"alloc_{SUFFIX}@example.com", role_ids["resident"])
    ids = {"buildings": [], "floors": [], "rooms": [], "beds": [], "residents": [], "admissions": [], "room_allocations": []}
    try:
        token = _login(client, db, f"warden_{SUFFIX}@example.com")
        h = _auth(client, token)

        b = db.table("buildings").insert({"name": f"IT Building {SUFFIX}", "code": f"ITB{SUFFIX}"}).execute().data[0]
        ids["buildings"].append(b["id"])
        f = db.table("floors").insert({"building_id": b["id"], "name": "G", "floor_number": 0}).execute().data[0]
        ids["floors"].append(f["id"])
        room = db.table("rooms").insert({"floor_id": f["id"], "room_number": f"R{SUFFIX}", "capacity": 2}).execute().data[0]
        ids["rooms"].append(room["id"])
        bed = db.table("beds").insert({"room_id": room["id"], "bed_number": f"B{SUFFIX}"}).execute().data[0]
        ids["beds"].append(bed["id"])

        resident = db.table("residents").insert({"user_id": resident_id, "first_name": "Alloc", "status": "applicant"}).execute().data[0]
        ids["residents"].append(resident["id"])
        adm = db.table("admissions").insert({"resident_id": resident["id"], "admission_number": f"ADM{SUFFIX}", "status": "approved"}).execute().data[0]
        ids["admissions"].append(adm["id"])

        # First allocation succeeds.
        r = client.post("/api/v1/room-allocations", headers=h, json={
            "resident_id": resident["id"], "room_id": room["id"], "bed_id": bed["id"], "admission_id": adm["id"],
        })
        assert r.status_code == 201, r.text
        alloc_id = r.json()["id"]
        ids["room_allocations"].append(alloc_id)

        # Same bed again -> 409 (already occupied).
        r = client.post("/api/v1/room-allocations", headers=h, json={
            "resident_id": resident["id"], "room_id": room["id"], "bed_id": bed["id"], "admission_id": adm["id"],
        })
        assert r.status_code == 409
    finally:
        _cleanup(db, [staff_id, resident_id], ids)


# ── Stay: check-in / check-out ───────────────────────────────────────────────
def test_check_in_check_out(client, db, role_ids):
    staff_id = _create_user(db, f"warden2_{SUFFIX}@example.com", role_ids["hostel_admin"])
    resident_id = _create_user(db, f"stay_{SUFFIX}@example.com", role_ids["resident"])
    ids = {"buildings": [], "floors": [], "rooms": [], "beds": [], "residents": [], "admissions": [], "room_allocations": [], "resident_stays": []}
    try:
        token = _login(client, db, f"warden2_{SUFFIX}@example.com")
        h = _auth(client, token)

        b = db.table("buildings").insert({"name": f"IT Building {SUFFIX}", "code": f"ITB2{SUFFIX}"}).execute().data[0]
        ids["buildings"].append(b["id"])
        f = db.table("floors").insert({"building_id": b["id"], "name": "G", "floor_number": 0}).execute().data[0]
        ids["floors"].append(f["id"])
        room = db.table("rooms").insert({"floor_id": f["id"], "room_number": f"R2{SUFFIX}", "capacity": 2}).execute().data[0]
        ids["rooms"].append(room["id"])
        bed = db.table("beds").insert({"room_id": room["id"], "bed_number": f"B2{SUFFIX}"}).execute().data[0]
        ids["beds"].append(bed["id"])
        resident = db.table("residents").insert({"user_id": resident_id, "first_name": "Stay", "status": "applicant"}).execute().data[0]
        ids["residents"].append(resident["id"])
        adm = db.table("admissions").insert({"resident_id": resident["id"], "admission_number": f"ADM2{SUFFIX}", "status": "approved"}).execute().data[0]
        ids["admissions"].append(adm["id"])

        r = client.post("/api/v1/room-allocations", headers=h, json={
            "resident_id": resident["id"], "room_id": room["id"], "bed_id": bed["id"], "admission_id": adm["id"],
        })
        assert r.status_code == 201
        alloc_id = r.json()["id"]
        ids["room_allocations"].append(alloc_id)

        r = client.post("/api/v1/resident-stays", headers=h, json={"resident_id": resident["id"], "allocation_id": alloc_id})
        assert r.status_code == 201, r.text
        stay_id = r.json()["id"]
        ids["resident_stays"].append(stay_id)

        r = client.post(f"/api/v1/resident-stays/{stay_id}/check-in", headers=h, json={})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "checked_in"

        r = client.post(f"/api/v1/resident-stays/{stay_id}/check-out", headers=h, json={})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "checked_out"

        # Bed released after checkout.
        bed_row = db.table("beds").select("status").eq("id", bed["id"]).execute().data[0]
        assert bed_row["status"] == "available"
    finally:
        _cleanup(db, [staff_id, resident_id], ids)


# ── Finance: invoice + payment ───────────────────────────────────────────────
def test_invoice_payment_and_overpayment(client, db, role_ids):
    staff_id = _create_user(db, f"acct_{SUFFIX}@example.com", role_ids["accountant"])
    resident_id = _create_user(db, f"fin_{SUFFIX}@example.com", role_ids["resident"])
    ids = {"residents": [], "invoices": [], "payments": []}
    try:
        token = _login(client, db, f"acct_{SUFFIX}@example.com")
        h = _auth(client, token)

        resident = db.table("residents").insert({"user_id": resident_id, "first_name": "Fin"}).execute().data[0]
        ids["residents"].append(resident["id"])

        r = client.post("/api/v1/invoices", headers=h, json={
            "resident_id": resident["id"],
            "items": [{"description": "Hostel fee", "quantity": "1", "unit_amount": "500.00"}],
        })
        assert r.status_code == 201, r.text
        invoice = r.json()
        ids["invoices"].append(invoice["id"])
        assert Decimal(invoice["total_amount"]) == Decimal("500.00")
        assert invoice["status"] == "draft"

        r = client.post(f"/api/v1/invoices/{invoice['id']}/issue", headers=h, json={})
        assert r.status_code == 200

        # Partial payment.
        r = client.post("/api/v1/payments", headers=h, json={
            "resident_id": resident["id"], "invoice_id": invoice["id"], "amount": "200.00",
        })
        assert r.status_code == 201, r.text
        ids["payments"].append(r.json()["id"])
        inv = db.table("invoices").select("status").eq("id", invoice["id"]).execute().data[0]
        assert inv["status"] == "partially_paid"

        # Remaining balance payment.
        r = client.post("/api/v1/payments", headers=h, json={
            "resident_id": resident["id"], "invoice_id": invoice["id"], "amount": "300.00",
        })
        assert r.status_code == 201
        ids["payments"].append(r.json()["id"])
        inv = db.table("invoices").select("status").eq("id", invoice["id"]).execute().data[0]
        assert inv["status"] == "paid"

        # Overpayment rejected.
        r = client.post("/api/v1/payments", headers=h, json={
            "resident_id": resident["id"], "invoice_id": invoice["id"], "amount": "1.00",
        })
        assert r.status_code == 400
        assert r.json()["detail"]["code"] == "payment_exceeds_balance"
    finally:
        _cleanup(db, [staff_id, resident_id], ids)
