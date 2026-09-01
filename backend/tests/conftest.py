"""Shared pytest fixtures.

Environment is configured BEFORE importing the app so the cached Settings and
the Supabase client pick them up. Integration tests are opt-in (they write to
the real Supabase database and require grants + seed + migrations to be applied).
"""

from __future__ import annotations

import os

os.environ.setdefault("JWT_SECRET", "pytest-secret-that-is-at-least-32-bytes-long!!")
os.environ.setdefault("OTP_EXPIRATION_SECONDS", "60")
os.environ.setdefault("OTP_MAX_ATTEMPTS", "3")

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client() -> TestClient:
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def settings():
    from app.core.config import get_settings

    return get_settings()
