"""Request/response schemas for the authentication API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.passwords import validate_password
from app.users.schemas import UserOut


class OTPRequest(BaseModel):
    """Step 1 of login: verify the account's password, then issue an OTP.

    The OTP is the *second* factor — it is only generated after this password
    check succeeds, and no JWT is issued here.
    """

    email: EmailStr = Field(description="Email of the account requesting a login OTP")
    password: str = Field(
        min_length=1,
        max_length=200,
        description="Account password (first factor). Validated for policy; never stored plaintext.",
    )

    @field_validator("password")
    @classmethod
    def _check_password_policy(cls, value: str) -> str:
        validate_password(value)
        return value


class OTPVerify(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=1, max_length=16, description="The 6-digit OTP received via the delivery channel")


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserOut


class OTPRequestResponse(BaseModel):
    message: str
    expires_in_seconds: int
