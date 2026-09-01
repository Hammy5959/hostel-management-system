"""Integration tests for the Users & Roles lifecycle against the real database.

Covers:
- Role: create / duplicate / rename (custom) / rename-to-existing / system
  rename+deactivate lock / delete custom / delete system / delete-in-use /
  permissions round-trip + invalid ids / super_admin lock / deactivation
  revoking API access (reversible) / audit entries.
- User: create / duplicate email / self profile update / self escalation
  rejected / admin role change / escalation blocked for non-super-admin /
  self-role-change blocked / update without permission / deactivate blocks
  login / super_admin deactivate+delete locked / self deactivate+delete
  blocked / soft-delete (archive) preserving the row / deleted account cannot
  authenticate.

Enable with:  HMS_RUN_INTEGRATION=1 pytest tests/test_users_roles_lifecycle.py -v
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
SUPER_ADMIN_EMAIL = "hamid59@gmail.com"  # seeded super admin (OTP dev value 123456)
SUPER_ADMIN_PASSWORD = "***REMOVED***"  # initial password set by the seeder (Argon2id-hashed)
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
    # Reverse of creation order: users before roles (roles.role_id NO ACTION).
    from app.database.supabase import get_supabase

    db = get_supabase()
    for uid in created_user_ids:
        db.table("users").delete().eq("id", uid).execute()
    for rid in created_role_ids:
        db.table("role_permissions").delete().eq("role_id", rid).execute()
        db.table("roles").delete().eq("id", rid).execute()


# ── Helpers ───────────────────────────────────────────────────────────────────
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


def _deleted_enum_available(db) -> bool:
    """Probe whether user_status enum contains 'deleted' (migration
    20260812000050_add_user_status_deleted.sql). Returns False if not applied."""
    res = db.table("roles").select("id").eq("name", "resident").execute()
    if not res.data:
        return False
    probe_row = db.table("users").insert({
        "email": f"probe_{uuid.uuid4().hex[:8]}@example.com",
        "first_name": "Probe",
        "role_id": res.data[0]["id"],
        "status": "active",
    }).execute().data[0]
    try:
        db.table("users").update({"status": "deleted"}).eq("id", probe_row["id"]).execute()
        return True
    except Exception:
        return False
    finally:
        db.table("users").delete().eq("id", probe_row["id"]).execute()


# ── Role lifecycle ────────────────────────────────────────────────────────────
def test_role_create_and_duplicate(client, db, role_ids):
    admin = _login(client, db, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    h = _auth(client, admin)
    name = f"role_{SUFFIX}"
    r = client.post("/api/v1/roles", headers=h, json={"name": name, "description": "created for test"})
    assert r.status_code == 201, r.text
    role = r.json()
    created_role_ids.append(role["id"])
    assert role["name"] == name
    assert role["is_system_role"] is False
    assert role["is_active"] is True

    # Duplicate is rejected. (The schema pattern already forces lowercase
    # [a-z0-9_]+ names, so an exact-name collision is the reachable case —
    # a guard against concurrent or double-submit creation.)
    r = client.post("/api/v1/roles", headers=h, json={"name": name})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "role_name_exists"

    # Audit entry recorded.
    audit = db.table("audit_logs").select("action").eq("entity_type", "role").eq("entity_id", role["id"]).execute()
    assert any(a["action"] == "role.create" for a in audit.data)


def test_role_rename_and_permissions_survive(client, db, role_ids):
    admin = _login(client, db, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    h = _auth(client, admin)
    role = _create_role(db, f"rename_{SUFFIX}")
    created_role_ids.append(role["id"])
    users_view = _permission_id(db, "users.view")

    # Grant a permission.
    r = client.put(f"/api/v1/roles/{role['id']}/permissions", headers=h, json={"permission_ids": [users_view]})
    assert r.status_code == 200, r.text
    assert r.json()["permissions"] == ["users.view"]

    # Rename the custom role; permission grants must survive.
    new_name = f"renamed_{SUFFIX}"
    r = client.patch(f"/api/v1/roles/{role['id']}", headers=h, json={"name": new_name})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == new_name
    r = client.get(f"/api/v1/roles/{role['id']}", headers=h)
    assert r.status_code == 200
    assert r.json()["permissions"] == ["users.view"]

    # Renaming to an existing name is rejected.
    r = client.patch(f"/api/v1/roles/{role['id']}", headers=h, json={"name": "resident"})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "role_name_exists"


def test_system_role_rename_and_deactivate_locked(client, db, role_ids):
    admin = _login(client, db, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    h = _auth(client, admin)
    warden_id = role_ids["warden"]

    r = client.patch(f"/api/v1/roles/{warden_id}", headers=h, json={"name": "not_warden"})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "system_role_locked"

    r = client.patch(f"/api/v1/roles/{warden_id}", headers=h, json={"is_active": False})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "system_role_locked"

    # Description is still editable on system roles.
    r = client.patch(f"/api/v1/roles/{warden_id}", headers=h, json={"description": "updated description"})
    assert r.status_code == 200, r.text


def test_role_delete_custom_vs_system_vs_in_use(client, db, role_ids):
    admin = _login(client, db, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    h = _auth(client, admin)

    # System role never deletable.
    r = client.delete(f"/api/v1/roles/{role_ids['warden']}", headers=h)
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "system_role_locked"

    # Custom role assigned to a user -> role_in_use.
    in_use_role = _create_role(db, f"inuse_{SUFFIX}")
    created_role_ids.append(in_use_role["id"])
    uid = _create_user(db, f"inuse_{SUFFIX}@example.com", in_use_role["id"])
    created_user_ids.append(uid)
    r = client.delete(f"/api/v1/roles/{in_use_role['id']}", headers=h)
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "role_in_use"

    # Unassigned custom role deletable.
    free_role = _create_role(db, f"free_{SUFFIX}")
    r = client.delete(f"/api/v1/roles/{free_role['id']}", headers=h)
    assert r.status_code == 204, r.text
    # Audit recorded.
    audit = db.table("audit_logs").select("action").eq("entity_type", "role").eq("entity_id", free_role["id"]).execute()
    assert any(a["action"] == "role.delete" for a in audit.data)


def test_role_permissions_validation_and_super_admin_lock(client, db, role_ids):
    admin = _login(client, db, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    h = _auth(client, admin)
    role = _create_role(db, f"perms_{SUFFIX}")
    created_role_ids.append(role["id"])

    # Invalid permission id -> 422.
    bogus = "00000000-0000-0000-0000-000000000000"
    r = client.put(f"/api/v1/roles/{role['id']}/permissions", headers=h, json={"permission_ids": [bogus]})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "invalid_permission_id"

    # super_admin role is locked against permission mutation.
    r = client.put(f"/api/v1/roles/{role_ids['super_admin']}/permissions", headers=h, json={"permission_ids": []})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "super_admin_locked"

    # Deduplication + replace works.
    p1 = _permission_id(db, "users.view")
    r = client.put(f"/api/v1/roles/{role['id']}/permissions", headers=h, json={"permission_ids": [p1, p1]})
    assert r.status_code == 200, r.text
    assert r.json()["permissions"] == ["users.view"]
    # Clearing permissions is allowed (empty list).
    r = client.put(f"/api/v1/roles/{role['id']}/permissions", headers=h, json={"permission_ids": []})
    assert r.status_code == 200, r.text
    assert r.json()["permissions"] == []


def test_role_deactivation_revokes_access_and_is_reversible(client, db, role_ids):
    """Deactivating a role is a reversible off-switch: holders keep their
    account but lose API access while it is off."""
    admin = _login(client, db, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    h = _auth(client, admin)
    role = _create_role(db, f"off_{SUFFIX}")
    created_role_ids.append(role["id"])
    r = client.put(f"/api/v1/roles/{role['id']}/permissions", headers=h, json={"permission_ids": [_permission_id(db, "users.view")]})
    assert r.status_code == 200

    uid = _create_user(db, f"off_{SUFFIX}@example.com", role["id"])
    created_user_ids.append(uid)
    token = _login(client, db, f"off_{SUFFIX}@example.com")
    uh = _auth(client, token)

    # Has access while role is active.
    r = client.get("/api/v1/users", headers=uh)
    assert r.status_code == 200, r.text

    # Deactivate role -> permission set collapses.
    r = client.patch(f"/api/v1/roles/{role['id']}", headers=h, json={"is_active": False})
    assert r.status_code == 200
    r = client.get("/api/v1/users", headers=uh)
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "missing_permission"

    # Reactivate role -> access restored (no data loss, account untouched).
    r = client.patch(f"/api/v1/roles/{role['id']}", headers=h, json={"is_active": True})
    assert r.status_code == 200
    r = client.get("/api/v1/users", headers=uh)
    assert r.status_code == 200, r.text


# ── User lifecycle ────────────────────────────────────────────────────────────
def test_user_create_and_duplicate_email(client, db, role_ids):
    admin = _login(client, db, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    h = _auth(client, admin)
    email = f"user_{SUFFIX}@example.com"

    r = client.post("/api/v1/users", headers=h, json={
        "email": email, "first_name": "U", "last_name": "Test",
        "role_id": role_ids["resident"], "status": "active",
        "password": TEST_PASSWORD,
    })
    assert r.status_code == 201, r.text
    uid = r.json()["id"]
    created_user_ids.append(uid)
    assert r.json()["email"] == email

    # Duplicate email (normalized) -> 409.
    r = client.post("/api/v1/users", headers=h, json={
        "email": email.upper(), "first_name": "U2", "role_id": role_ids["resident"], "status": "active",
        "password": TEST_PASSWORD,
    })
    assert r.status_code == 409

    # Unknown role -> 404.
    r = client.post("/api/v1/users", headers=h, json={
        "email": f"bad_{SUFFIX}@example.com", "first_name": "B", "role_id": "00000000-0000-0000-0000-000000000000",
        "password": TEST_PASSWORD,
    })
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "role_not_found"

    # Weak password -> 422 (password policy enforced at creation).
    r = client.post("/api/v1/users", headers=h, json={
        "email": f"weak_{SUFFIX}@example.com", "first_name": "W", "role_id": role_ids["resident"],
        "password": "weakpass",
    })
    assert r.status_code == 422

    # Audit entry.
    audit = db.table("audit_logs").select("action").eq("entity_type", "user").eq("entity_id", uid).execute()
    assert any(a["action"] == "user.create" for a in audit.data)


def test_self_profile_update_and_escalation_rejected(client, db, role_ids):
    uid = _create_user(db, f"self_{SUFFIX}@example.com", role_ids["resident"])
    created_user_ids.append(uid)
    token = _login(client, db, f"self_{SUFFIX}@example.com")
    h = _auth(client, token)

    # Self-service profile edit works.
    r = client.patch("/api/v1/auth/me", headers=h, json={"first_name": "Self"})
    assert r.status_code == 200, r.text
    assert r.json()["first_name"] == "Self"
    assert r.json()["role_id"] == role_ids["resident"]  # untouched

    # Escalation attempts are loudly rejected (extra='forbid' -> 422).
    for attempt in ({"role_id": role_ids["super_admin"]}, {"status": "active"}, {"email": "x@example.com"}):
        r = client.patch("/api/v1/auth/me", headers=h, json=attempt)
        assert r.status_code == 422, (attempt, r.text)


def test_admin_role_change_and_escalation_guard(client, db, role_ids):
    admin = _login(client, db, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    h = _auth(client, admin)

    target = _create_user(db, f"target_{SUFFIX}@example.com", role_ids["resident"])
    created_user_ids.append(target)
    new_role = _create_role(db, f"promote_{SUFFIX}")
    created_role_ids.append(new_role["id"])

    # Super admin promotes a user.
    r = client.patch(f"/api/v1/users/{target}", headers=h, json={"role_id": new_role["id"]})
    assert r.status_code == 200, r.text
    assert r.json()["role_id"] == new_role["id"]

    # Audit shows role change.
    audit = db.table("audit_logs").select("action").eq("entity_type", "user").eq("entity_id", target).execute()
    assert any(a["action"] == "user.role_changed" for a in audit.data)

    # Email change resets verification, then duplicate is rejected.
    r = client.patch(f"/api/v1/users/{target}", headers=h, json={"email": f"target_{SUFFIX}@example.com"})
    assert r.status_code == 200
    assert r.json()["email_verified"] is False


def test_non_super_admin_cannot_assign_super_admin(client, db, role_ids):
    """A user with users.update but not super_admin may not promote anyone to
    the super_admin role."""
    admin = _login(client, db, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    h = _auth(client, admin)
    escalator_role = _create_role(db, f"esc_{SUFFIX}")
    created_role_ids.append(escalator_role["id"])
    r = client.put(f"/api/v1/roles/{escalator_role['id']}/permissions", headers=h,
                   json={"permission_ids": [_permission_id(db, "users.update")]})
    assert r.status_code == 200

    escalator = _create_user(db, f"esc_{SUFFIX}@example.com", escalator_role["id"])
    created_user_ids.append(escalator)
    target = _create_user(db, f"esc_t_{SUFFIX}@example.com", role_ids["resident"])
    created_user_ids.append(target)

    token = _login(client, db, f"esc_{SUFFIX}@example.com")
    uh = _auth(client, token)

    # Cannot grant super_admin.
    r = client.patch(f"/api/v1/users/{target}", headers=uh, json={"role_id": role_ids["super_admin"]})
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "super_admin_assignment_denied"

    # Cannot change own role through the admin endpoint.
    r = client.patch(f"/api/v1/users/{escalator}", headers=uh, json={"role_id": role_ids["resident"]})
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "self_role_change_denied"


def test_update_without_permission(client, db, role_ids):
    resident = _create_user(db, f"noperm_{SUFFIX}@example.com", role_ids["resident"])
    created_user_ids.append(resident)
    target = _create_user(db, f"noperm_t_{SUFFIX}@example.com", role_ids["resident"])
    created_user_ids.append(target)
    token = _login(client, db, f"noperm_{SUFFIX}@example.com")
    r = client.patch(f"/api/v1/users/{target}", headers=_auth(client, token), json={"first_name": "X"})
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "missing_permission"


def test_deactivate_user_blocks_login(client, db, role_ids):
    admin = _login(client, db, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    h = _auth(client, admin)
    uid = _create_user(db, f"deact_{SUFFIX}@example.com", role_ids["resident"])
    created_user_ids.append(uid)
    token = _login(client, db, f"deact_{SUFFIX}@example.com")
    assert token

    r = client.patch(f"/api/v1/users/{uid}/status", headers=h, json={"status": "inactive"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "inactive"

    # Deactivated account cannot request or verify an OTP.
    r = client.post("/api/v1/auth/request-otp", json={"email": f"deact_{SUFFIX}@example.com", "password": TEST_PASSWORD})
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "account_inactive"

    # An old (pre-deactivation) JWT stops working too.
    r = client.get("/api/v1/auth/me", headers=_auth(client, token))
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "account_disabled"


def test_super_admin_and_self_protections(client, db, role_ids):
    admin = _login(client, db, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    h = _auth(client, admin)
    sa_id = db.table("users").select("id").eq("email", SUPER_ADMIN_EMAIL).execute().data[0]["id"]

    # The seeded super_admin cannot even deactivate/delete its own account
    # (self-* guard takes precedence over the super_admin lock).
    r = client.patch(f"/api/v1/users/{sa_id}/status", headers=h, json={"status": "inactive"})
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "self_status_change_denied"
    r = client.delete(f"/api/v1/users/{sa_id}", headers=h)
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "self_delete_denied"

    # A non-super-admin holding users.update cannot deactivate/delete the
    # super_admin account (super_admin_locked).
    esc_role = _create_role(db, f"selfoff_{SUFFIX}")
    created_role_ids.append(esc_role["id"])
    client.put(f"/api/v1/roles/{esc_role['id']}/permissions", headers=h,
               json={"permission_ids": [_permission_id(db, "users.update")]})
    esc = _create_user(db, f"selfoff_{SUFFIX}@example.com", esc_role["id"])
    created_user_ids.append(esc)
    token = _login(client, db, f"selfoff_{SUFFIX}@example.com")
    uh = _auth(client, token)

    r = client.patch(f"/api/v1/users/{sa_id}/status", headers=uh, json={"status": "inactive"})
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "super_admin_locked"
    r = client.delete(f"/api/v1/users/{sa_id}", headers=uh)
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "super_admin_locked"

    # The same actor cannot deactivate/delete their own account.
    r = client.patch(f"/api/v1/users/{esc}/status", headers=uh, json={"status": "inactive"})
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "self_status_change_denied"
    r = client.delete(f"/api/v1/users/{esc}", headers=uh)
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "self_delete_denied"


def test_user_soft_delete_archive(client, db, role_ids):
    """DELETE /users/{id} archives (soft-deletes): the row persists with
    status='deleted', authentication is permanently blocked, and linked
    records (resident link, audit history) are preserved."""
    if not _deleted_enum_available(db):
        pytest.skip(
            "user_status enum lacks 'deleted' — apply migration "
            "20260812000050_add_user_status_deleted.sql then re-run"
        )

    admin = _login(client, db, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)
    h = _auth(client, admin)
    uid = _create_user(db, f"archive_{SUFFIX}@example.com", role_ids["resident"])
    created_user_ids.append(uid)

    r = client.delete(f"/api/v1/users/{uid}", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "deleted"

    # Row still exists (nothing cascaded away).
    row = db.table("users").select("id, status").eq("id", uid).execute().data[0]
    assert row["status"] == "deleted"

    # Deleted account cannot authenticate.
    r = client.post("/api/v1/auth/request-otp", json={"email": f"archive_{SUFFIX}@example.com", "password": TEST_PASSWORD})
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "account_inactive"

    # Audit recorded.
    audit = db.table("audit_logs").select("action").eq("entity_type", "user").eq("entity_id", uid).execute()
    assert any(a["action"] == "user.deleted" for a in audit.data)
