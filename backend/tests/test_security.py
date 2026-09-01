"""JWT unit tests."""

from __future__ import annotations

import jwt
import pytest

from app.core.security import create_access_token, decode_access_token

SUBJECT = "11111111-1111-1111-1111-111111111111"
ROLE = "22222222-2222-2222-2222-222222222222"


def test_create_and_decode_roundtrip():
    token = create_access_token(subject=SUBJECT, role_id=ROLE)
    payload = decode_access_token(token)
    assert payload["sub"] == SUBJECT
    assert payload["role"] == ROLE
    assert payload["type"] == "access"


def test_tampered_token_rejected():
    token = create_access_token(subject=SUBJECT)
    tampered = token[:-4] + "AAAA"
    with pytest.raises(jwt.PyJWTError):
        decode_access_token(tampered)


def test_garbage_token_rejected():
    with pytest.raises(jwt.PyJWTError):
        decode_access_token("not.a.jwt")
