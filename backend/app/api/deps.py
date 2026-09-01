"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Generator

from supabase import Client

from app.database.supabase import get_supabase


def get_db() -> Generator[Client, None, None]:
    """Provide the service-role Supabase client to route handlers."""
    yield get_supabase()
