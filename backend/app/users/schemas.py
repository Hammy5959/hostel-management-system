"""User account schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.passwords import validate_password

_USER_SELF_CFG = ConfigDict(extra="forbid")


class UserCreate(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=200)
    last_name: str | None = Field(default=None, max_length=200)
    phone: str | None = None
    role_id: UUID
    status: Literal["invited", "active"] = "invited"
    profile_picture_url: str | None = None
    password: str = Field(
        min_length=1,
        max_length=200,
        description="Initial password. Stored only as an Argon2id hash — never plaintext.",
    )

    @field_validator("password")
    @classmethod
    def _check_password_policy(cls, value: str) -> str:
        validate_password(value)
        return value


class UserUpdate(BaseModel):
    """Admin edits. Changing email requires the new address to be verified on
    the next OTP login (email_verified is reset to False)."""
    first_name: str | None = Field(default=None, min_length=1, max_length=200)
    last_name: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    phone: str | None = None
    role_id: UUID | None = None
    profile_picture_url: str | None = None


class UserSelfUpdate(BaseModel):
    """Self-service profile edits. Role, status and email are deliberately
    excluded: a user can never escalate or reassign their own account.
    Unknown fields are rejected (extra="forbid") so an escalation attempt
    returns a loud 422 instead of being silently ignored."""
    model_config = _USER_SELF_CFG

    first_name: str | None = Field(default=None, min_length=1, max_length=200)
    last_name: str | None = Field(default=None, max_length=200)
    phone: str | None = None
    profile_picture_url: str | None = None


class UserStatusUpdate(BaseModel):
    status: Literal["active", "inactive", "suspended"]


class UserOut(BaseModel):
    """Public user representation — never exposes secrets.

    `password`/`password_hash` are intentionally absent. Even if a caller
    passes a raw DB row containing them, extra='ignore' (the Pydantic default)
    drops them before they reach a response.
    """

    model_config = ConfigDict(from_attributes=True, extra="ignore")

    id: UUID
    role_id: UUID
    first_name: str
    last_name: str | None = None
    email: EmailStr
    phone: str | None = None
    profile_picture_url: str | None = None
    status: str
    email_verified: bool
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class UserList(BaseModel):
    items: list[UserOut]
    total: int
    page: int
    per_page: int
