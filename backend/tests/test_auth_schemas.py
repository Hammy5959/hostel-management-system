"""Unit tests for app.auth.schemas.OTPRequest — confirms the login schema
never applies the password-*creation* complexity policy (minimum length, a
digit, a special character) to the login password field. Any wrong password
must reach app.auth.service.request_otp's actual credential check instead of
being rejected by Pydantic first. Pure schema tests — no database.
"""

from __future__ import annotations

import pytest

from app.auth.schemas import OTPRequest


@pytest.mark.parametrize(
    "password",
    [
        "asdfghjk",  # the exact example from the bug report: no digit, no special character
        "short",  # under the 8-character creation-policy minimum
        "alllowercaseletters",  # no digit, no special character, but long enough
        "Str0ng!pass",  # also happens to satisfy the (irrelevant, for login) complexity policy
    ],
)
def test_otp_request_accepts_any_non_empty_password_regardless_of_format(password):
    # Must not raise — password-format checks belong only where a password is
    # created or changed (see app.users.schemas / app.residents.schemas),
    # never on login.
    request = OTPRequest(email="a@example.com", password=password)
    assert request.password == password


def test_otp_request_still_rejects_empty_password():
    with pytest.raises(Exception):
        OTPRequest(email="a@example.com", password="")
