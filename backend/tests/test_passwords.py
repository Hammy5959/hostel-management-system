"""Unit tests for Argon2id password hashing and the password policy.

These are pure-function tests — no database involved.
"""

from __future__ import annotations

import pytest

from app.core.passwords import hash_password, validate_password, verify_password


# ── Password policy ───────────────────────────────────────────────────────────
class TestPasswordPolicy:
    @pytest.mark.parametrize(
        "password",
        [
            "***REMOVED***",      # meets all rules
            "Str0ng!pass",
            "a1!b2@c3#d4",
            "X1$y2^z3&",      # symbols from the explicit set
        ],
    )
    def test_valid_passwords(self, password):
        validate_password(password)  # must not raise

    @pytest.mark.parametrize(
        ("password", "expected_fragment"),
        [
            ("Abc@12", "8 characters"),          # too short
            ("abcdefgh", "number"),              # no number
            ("abcd1234", "special character"),   # no special symbol
            ("ABCDEFG1", "special character"),   # no special symbol
        ],
    )
    def test_invalid_passwords_raise(self, password, expected_fragment):
        with pytest.raises(ValueError) as exc:
            validate_password(password)
        assert expected_fragment in str(exc.value)


# ── Hashing ───────────────────────────────────────────────────────────────────
class TestHashing:
    def test_hash_is_not_plaintext(self):
        hashed = hash_password("***REMOVED***")
        assert hashed != "***REMOVED***"
        assert hashed.startswith("$argon2id$")  # Argon2id, the required KDF

    def test_hashes_are_salted(self):
        """Two hashes of the same password differ (unique random salt)."""
        assert hash_password("***REMOVED***") != hash_password("***REMOVED***")

    def test_correct_password_verifies(self):
        hashed = hash_password("***REMOVED***")
        assert verify_password(hashed, "***REMOVED***") is True

    def test_wrong_password_fails(self):
        hashed = hash_password("***REMOVED***")
        assert verify_password(hashed, "wrong-pass") is False

    def test_missing_hash_fails(self):
        assert verify_password(None, "***REMOVED***") is False
        assert verify_password("", "***REMOVED***") is False

    def test_garbage_hash_fails(self):
        assert verify_password("not-an-argon2-hash", "***REMOVED***") is False

    def test_password_never_appears_in_hash(self):
        hashed = hash_password("***REMOVED***")
        assert "***REMOVED***" not in hashed
