"""Hostel settings schemas.

There is exactly one settings row (a singleton, enforced at the DB level —
see app.hostel_settings.service) — no create schema exists since the row is
seeded by migration/get-or-create, never via the API.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class HostelSettingsUpdate(BaseModel):
    hostel_name: str | None = Field(default=None, min_length=1, max_length=200)
    hostel_code: str | None = Field(default=None, max_length=50)
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    phone: str | None = None
    email: str | None = None
    total_capacity: int | None = Field(default=None, ge=0)
    logo_url: str | None = None
    timezone: str | None = None
    currency: str | None = Field(default=None, max_length=3)
    # "#rrggbb" (any case, stored lowercase) or null to reset to the default.
    primary_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")

    @field_validator("primary_color")
    @classmethod
    def _lowercase_primary_color(cls, value: str | None) -> str | None:
        # Matches the DB check constraint (lowercase only).
        return value.lower() if value else value


class HostelSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    hostel_name: str
    hostel_code: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    phone: str | None = None
    email: str | None = None
    total_capacity: int | None = None
    logo_url: str | None = None
    timezone: str | None = None
    currency: str | None = None
    primary_color: str | None = None
    created_at: datetime
    updated_at: datetime


class HostelPublicBrandingOut(BaseModel):
    """Unauthenticated branding subset for pre-login pages (login/OTP, tab
    title, favicon) and the app-wide brand color. Deliberately only name,
    logo and color — all visible to anyone who opens the login page anyway;
    contact/address/capacity stay behind GET /hostel-settings/current."""

    hostel_name: str
    logo_url: str | None = None
    primary_color: str | None = None


class HostelBrandingOut(BaseModel):
    """Minimal branding/locale subset embedded in the login response so the
    frontend can render the topbar/sidebar brand synchronously, with no
    flash, before the live GET /hostel-settings/current fetch resolves."""

    hostel_name: str
    logo_url: str | None = None
    timezone: str | None = None
    currency: str | None = None
