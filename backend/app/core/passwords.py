"""Password hashing and validation.

Authentication is two-factor: a password (this module) verified first, then an
OTP. Only the Argon2id hash of a password is ever persisted — plaintext
passwords are never stored, logged, or returned by the API.

Design notes
------------
- Hashing uses **Argon2id** (argon2-cffi's default), the OWASP-recommended
  memory-hard KDF. Each hash embeds its own random salt and tuning parameters,
  so no separate salt column is needed and re-hashing the same password yields
  a different encoded string every time.
- ``validate_password`` raises ``ValueError`` so Pydantic field validators can
  surface a clean 422; service-layer callers that need a 400 can translate it.
- ``verify_password`` never raises on a bad input/hash; it returns ``False`` so
  callers can fail with a uniform "invalid credentials" response.
"""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

# Policy: at least 8 characters, at least 1 number, at least 1 symbol.
MIN_PASSWORD_LENGTH = 8
_SPECIAL_CHARS = set("!@#$%^&*()-_=+[]{};:'\",.<>/?\\|~`")

_hasher = PasswordHasher()


def validate_password(password: str) -> None:
    """Enforce the password policy, raising ``ValueError`` on any violation.

    Rules:
      - at least ``MIN_PASSWORD_LENGTH`` characters
      - at least one digit
      - at least one special character/symbol
    """
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")
    if not any(c.isdigit() for c in password):
        raise ValueError("Password must contain at least one number")
    if not any(c in _SPECIAL_CHARS for c in password):
        raise ValueError("Password must contain at least one special character")


def hash_password(password: str) -> str:
    """Return the Argon2id hash of a password.

    Callers are expected to have validated the password first via
    ``validate_password``; this function does not re-validate (it must also be
    usable by the seeder, which is the only other producer of hashes).
    """
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """Verify a plaintext password against a stored Argon2id hash.

    Returns ``False`` (instead of raising) when the hash is missing, malformed,
    or does not match — so every failure maps to the same generic
    "invalid credentials" response and never reveals account state.
    """
    if not password_hash:
        return False
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False
