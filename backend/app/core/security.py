"""JWT creation and verification.

Identifies the authenticated user. The subject claim holds the user UUID.
No secrets are ever logged.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import get_settings


def create_access_token(*, subject: str, role_id: str | None = None) -> str:
    """Create a signed JWT for the given user id."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload: dict = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(seconds=settings.jwt_expiration_seconds),
        "type": "access",
    }
    if role_id:
        payload["role"] = role_id
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT. Raises jwt.PyJWTError on any failure."""
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
