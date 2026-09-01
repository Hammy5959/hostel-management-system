"""Unit tests for the Users & Roles lifecycle schemas (no database).

These assert the *contracts* the API enforces: what a self-service update may
touch, what a status transition may be, and what a role name may look like.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.roles.schemas import RoleCreate, RolePermissionsUpdate, RoleUpdate
from app.users.schemas import UserCreate, UserOut, UserSelfUpdate, UserStatusUpdate, UserUpdate


# ── Self-service profile update ───────────────────────────────────────────────
class TestUserSelfUpdate:
    def test_allows_profile_fields_only(self):
        payload = UserSelfUpdate(
            first_name="Ada", last_name="Lovelace", phone="+1555", profile_picture_url="https://cdn/x.png"
        )
        assert payload.first_name == "Ada"
        assert payload.last_name == "Lovelace"

    def test_empty_payload_is_valid(self):
        assert UserSelfUpdate().model_dump(exclude_unset=True) == {}

    def test_rejects_role_escalation(self):
        """A user must never be able to change their own role/status/email."""
        for forbidden in ("role_id", "status", "email"):
            with pytest.raises(ValidationError):
                UserSelfUpdate(**{forbidden: "x"})

    def test_rejects_unknown_fields(self):
        """extra='forbid': escalation attempts fail loudly instead of being
        silently dropped by Pydantic's default ignore behaviour."""
        with pytest.raises(ValidationError):
            UserSelfUpdate(password="hunter2")


# ── Status transitions ────────────────────────────────────────────────────────
class TestUserStatusUpdate:
    def test_active_inactive_suspended_allowed(self):
        for s in ("active", "inactive", "suspended"):
            assert UserStatusUpdate(status=s).status == s

    def test_deleted_not_assignable_here(self):
        """Soft-delete is a separate endpoint (DELETE /users/{id}), not a
        status a caller can freely flip to."""
        with pytest.raises(ValidationError):
            UserStatusUpdate(status="deleted")


# ── Admin user update ─────────────────────────────────────────────────────────
class TestUserUpdate:
    def test_allows_email_and_role(self):
        payload = UserUpdate(email="ada@example.com", role_id="00000000-0000-0000-0000-000000000001")
        assert payload.email == "ada@example.com"
        assert payload.role_id is not None

    def test_email_must_be_valid(self):
        with pytest.raises(ValidationError):
            UserUpdate(email="not-an-email")


class TestUserCreate:
    VALID_PASSWORD = "Init1al#Pass"

    def _payload(self, **overrides):
        base = dict(
            email="ada@example.com",
            first_name="Ada",
            role_id="00000000-0000-0000-0000-000000000001",
            password=self.VALID_PASSWORD,
        )
        base.update(overrides)
        return base

    def test_defaults_to_invited(self):
        payload = UserCreate(**self._payload())
        assert payload.status == "invited"
        assert payload.password == self.VALID_PASSWORD

    def test_status_limited_to_invited_active(self):
        with pytest.raises(ValidationError):
            UserCreate(**self._payload(status="suspended"))

    def test_password_required(self):
        with pytest.raises(ValidationError):
            UserCreate(**self._payload(password=None))

    @pytest.mark.parametrize(
        "bad",
        ["short", "abcdefgh", "abcd1234"],  # too short / no number / no symbol
    )
    def test_rejects_weak_password(self, bad):
        with pytest.raises(ValidationError):
            UserCreate(**self._payload(password=bad))


class TestUserOutNeverLeaksSecrets:
    """The public user shape must never include password fields, even when a
    raw DB row (which carries `password_hash`) is validated."""

    def _row(self):
        return {
            "id": "00000000-0000-0000-0000-000000000001",
            "role_id": "00000000-0000-0000-0000-000000000002",
            "first_name": "Ada",
            "last_name": "Lovelace",
            "email": "ada@example.com",
            "status": "active",
            "email_verified": True,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "password": "plaintext-should-never-leak",
            "password_hash": "$argon2id$v=19$m=65536,t=3,p=4$SA/salt$hashhash",
        }

    def test_password_fields_stripped(self):
        out = UserOut.model_validate(self._row())
        dumped = out.model_dump(mode="json")
        assert "password" not in dumped
        assert "password_hash" not in dumped

    def test_model_validation_preserves_public_fields(self):
        out = UserOut.model_validate(self._row())
        assert out.email == "ada@example.com"


# ── Role names ────────────────────────────────────────────────────────────────
class TestRoleNameValidation:
    @pytest.mark.parametrize("name", ["admin", "front_desk_2", "a"])
    def test_valid_names(self, name):
        assert RoleCreate(name=name).name == name

    @pytest.mark.parametrize("name", ["Admin", "front desk", "admin!", "with-hyphen", ""])
    def test_invalid_names(self, name):
        with pytest.raises(ValidationError):
            RoleCreate(name=name)

    def test_update_accepts_optional_rename(self):
        assert RoleUpdate().model_dump(exclude_unset=True) == {}
        assert RoleUpdate(name="new_name").name == "new_name"


class TestRolePermissionsUpdate:
    def test_empty_list_clears_permissions(self):
        assert RolePermissionsUpdate(permission_ids=[]).permission_ids == []

    def test_accepts_uuids(self):
        p = RolePermissionsUpdate(
            permission_ids=["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002"]
        )
        assert len(p.permission_ids) == 2

    def test_rejects_non_uuid(self):
        with pytest.raises(ValidationError):
            RolePermissionsUpdate(permission_ids=["not-a-uuid"])
