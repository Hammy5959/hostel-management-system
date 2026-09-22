"""Request/response schemas for the authentication API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.hostel_settings.schemas import HostelBrandingOut
from app.users.schemas import UserOut


class OTPRequest(BaseModel):
    """Step 1 of login: verify the account's password, then issue an OTP.

    The OTP is the *second* factor — it is only generated after this password
    check succeeds, and no JWT is issued here.

    The password is deliberately NOT checked against the password-complexity
    policy here — that policy only applies where a password is created or
    changed (see app.users.schemas / app.residents.schemas). On login, any
    wrong password — regardless of format — must fail the same way (a 401
    from verify_password in app.auth.service), so a mistyped password never
    produces a different error than an intentionally wrong one.
    """

    email: EmailStr = Field(description="Email of the account requesting a login OTP")
    password: str = Field(
        min_length=1,
        max_length=200,
        description="Account password (first factor). Never stored plaintext.",
    )


class OTPVerify(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=1, max_length=16, description="The 6-digit OTP received via the delivery channel")


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserOut
    permissions: list[str]
    role_name: str | None = None
    branding: HostelBrandingOut


class OTPRequestResponse(BaseModel):
    message: str
    expires_in_seconds: int
