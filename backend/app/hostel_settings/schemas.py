"""Hostel settings schemas.

There is exactly one settings row (a singleton, enforced at the DB level —
see app.hostel_settings.service) — no create schema exists since the row is
seeded by migration/get-or-create, never via the API.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


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
    created_at: datetime
    updated_at: datetime


class HostelBrandingOut(BaseModel):
    """Minimal branding/locale subset embedded in the login response so the
    frontend can render the topbar/sidebar brand synchronously, with no
    flash, before the live GET /hostel-settings/current fetch resolves."""

    hostel_name: str
    logo_url: str | None = None
    timezone: str | None = None
    currency: str | None = None
