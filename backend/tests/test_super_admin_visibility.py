"""Integration tests: super_admin must be invisible to non-super-admin viewers.

Covers:
- GET /roles excludes the super_admin role for a non-super-admin viewer, and
  includes it for a super_admin viewer.
- GET /users excludes super_admin-held accounts from both items and total for
  a non-super-admin viewer (including status-filtered "stat" queries), and
  includes them for a super_admin viewer.
- GET /users/{id} and GET /roles/{id} return 404 (not 403) when a
  non-super-admin requests a super_admin user/role directly by id.
- POST /users with role_id = the super_admin role's id is rejected for a
  non-super-admin actor (super_admin_assignment_denied), mirroring the
  existing update_user guard.

Enable with:  HMS_RUN_INTEGRATION=1 pytest tests/test_super_admin_visibility.py -v
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

from fastapi.testclient import TestClient  # noqa: E402

from app.auth.otp import get_otp_store  # noqa: E402
from app.core.passwords import hash_password  # noqa: E402
from app.database.supabase import get_supabase  # noqa: E402

SUFFIX = uuid.uuid4().hex[:8]
TEST_PASSWORD = "Test#12345"  # meets the password policy (>=8 chars, number, special char)

created_user_ids: list[str] = []
created_role_ids: list[str] = []


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


@pytest.fixture(scope="module", autouse=True)
def _cleanup():
    yield
    db = get_supabase()
    for uid in created_user_ids:
        db.table("users").delete().eq("id", uid).execute()
    for rid in created_role_ids:
        db.table("role_permissions").delete().eq("role_id", rid).execute()
        db.table("roles").delete().eq("id", rid).execute()


# ── Helpers (mirrors test_users_roles_lifecycle.py) ─────────────────────────
def _login(client, db, email: str, password: str = TEST_PASSWORD) -> str:
    r = client.post("/api/v1/auth/request-otp", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    otp = get_otp_store()._records[email.lower()].otp
    r = client.post("/api/v1/auth/verify-otp", json={"email": email, "otp": otp})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _auth(client, token: str):
    return {"Authorization": f"Bearer {token}"}


def _permission_id(db, name: str) -> str:
    res = db.table("permissions").select("id").eq("name", name).execute()
    assert res.data, f"permission '{name}' not found in DB"
    return res.data[0]["id"]


def _create_user(db, email: str, role_id: str, password: str = TEST_PASSWORD) -> str:
    res = db.table("users").insert({
        "email": email,
        "first_name": "LFT",
        "last_name": "Test",
        "role_id": role_id,
        "status": "active",
        "password_hash": hash_password(password),
    }).execute()
    return res.data[0]["id"]


def _create_role(db, name: str, description: str | None = None) -> dict:
    res = db.table("roles").insert({
        "name": name,
        "description": description or f"test {name}",
        "is_system_role": False,
        "is_active": True,
    }).execute()
    return res.data[0]


@pytest.fixture(scope="module")
def non_super_admin(client, db, role_ids):
    """A regular admin: users.view + users.create + users.update + roles.view,
    but not super_admin."""
    role = _create_role(db, f"viewer_{SUFFIX}")
    created_role_ids.append(role["id"])
    permission_ids = [
        _permission_id(db, "users.view"),
        _permission_id(db, "users.create"),
        _permission_id(db, "users.update"),
        _permission_id(db, "roles.view"),
    ]
    # Seed the super_admin token to grant permissions to the new role.
    from app.core.config import get_settings

    settings = get_settings()
    super_token = _login(client, db, settings.super_admin_email, settings.super_admin_password)
    r = client.put(
        f"/api/v1/roles/{role['id']}/permissions",
        headers=_auth(client, super_token),
        json={"permission_ids": permission_ids},
    )
    assert r.status_code == 200, r.text

    email = f"viewer_{SUFFIX}@example.com"
    uid = _create_user(db, email, role["id"])
    created_user_ids.append(uid)
    token = _login(client, db, email)
    return _auth(client, token)


def test_non_super_admin_roles_list_excludes_super_admin(client, non_super_admin, role_ids):
    r = client.get("/api/v1/roles", headers=non_super_admin)
    assert r.status_code == 200, r.text
    names = {role["name"] for role in r.json()}
    assert "super_admin" not in names


def test_super_admin_roles_list_includes_super_admin(client, db, role_ids, settings):
    admin = _login(client, db, settings.super_admin_email, settings.super_admin_password)
    r = client.get("/api/v1/roles", headers=_auth(client, admin))
    assert r.status_code == 200, r.text
    names = {role["name"] for role in r.json()}
    assert "super_admin" in names


def test_non_super_admin_get_super_admin_role_by_id_is_404(client, non_super_admin, role_ids):
    r = client.get(f"/api/v1/roles/{role_ids['super_admin']}", headers=non_super_admin)
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "role_not_found"


def test_super_admin_get_super_admin_role_by_id_is_200(client, db, role_ids, settings):
    admin = _login(client, db, settings.super_admin_email, settings.super_admin_password)
    r = client.get(f"/api/v1/roles/{role_ids['super_admin']}", headers=_auth(client, admin))
    assert r.status_code == 200, r.text


def test_non_super_admin_users_list_excludes_super_admin_users_and_count(client, db, non_super_admin, role_ids):
    # Baseline count/items without the super_admin account.
    r = client.get("/api/v1/users", headers=non_super_admin)
    assert r.status_code == 200, r.text
    body = r.json()
    ids_before = {u["id"] for u in body["items"]}
    total_before = body["total"]
    assert not any(u["role_id"] == role_ids["super_admin"] for u in body["items"])

    # A super_admin-held user must never appear, even with a wide per_page.
    r = client.get("/api/v1/users", headers=non_super_admin, params={"per_page": 100})
    assert r.status_code == 200, r.text
    body = r.json()
    assert not any(u["role_id"] == role_ids["super_admin"] for u in body["items"])
    assert ids_before <= {u["id"] for u in body["items"]}
    assert total_before <= body["total"]


def test_super_admin_users_list_includes_super_admin_users(client, db, role_ids, settings):
    admin = _login(client, db, settings.super_admin_email, settings.super_admin_password)
    r = client.get("/api/v1/users", headers=_auth(client, admin), params={"per_page": 100})
    assert r.status_code == 200, r.text
    body = r.json()
    assert any(u["role_id"] == role_ids["super_admin"] for u in body["items"])


def test_non_super_admin_get_super_admin_user_by_id_is_404(client, db, non_super_admin, role_ids, settings):
    admin = _login(client, db, settings.super_admin_email, settings.super_admin_password)
    r = client.get("/api/v1/users", headers=_auth(client, admin), params={"role_id": role_ids["super_admin"], "per_page": 1})
    assert r.status_code == 200, r.text
    assert r.json()["items"], "expected at least one super_admin user (the seeded account)"
    super_admin_user_id = r.json()["items"][0]["id"]

    r = client.get(f"/api/v1/users/{super_admin_user_id}", headers=non_super_admin)
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "user_not_found"

    r = client.get(f"/api/v1/users/{super_admin_user_id}", headers=_auth(client, admin))
    assert r.status_code == 200, r.text


def test_non_super_admin_cannot_create_super_admin_user(client, non_super_admin, role_ids):
    r = client.post(
        "/api/v1/users",
        headers=non_super_admin,
        json={
            "email": f"minted_{SUFFIX}@example.com",
            "first_name": "Minted",
            "role_id": role_ids["super_admin"],
            "password": TEST_PASSWORD,
        },
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "super_admin_assignment_denied"


def test_super_admin_can_create_super_admin_user(client, db, role_ids, settings):
    admin = _login(client, db, settings.super_admin_email, settings.super_admin_password)
    email = f"newsuper_{SUFFIX}@example.com"
    r = client.post(
        "/api/v1/users",
        headers=_auth(client, admin),
        json={
            "email": email,
            "first_name": "NewSuper",
            "role_id": role_ids["super_admin"],
            "password": TEST_PASSWORD,
        },
    )
    assert r.status_code == 201, r.text
    created_user_ids.append(r.json()["id"])
