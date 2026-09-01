"""Supabase client (PostgREST) access.

The backend talks to Supabase exclusively through the service-role key so it can
bypass RLS. Application-level authorization (RBAC + ownership checks in services)
is therefore the enforcement layer; RLS remains enabled as defense-in-depth.

Security contract:
  - service-role key is loaded from the environment only, never from source
  - never returned in API responses, never logged
"""

from __future__ import annotations

from typing import Any

from httpx import Client as HttpxClient
from supabase import Client, ClientOptions, create_client

from app.core.config import get_settings
from app.core.exceptions import AppError

# postgrest-py hardcodes HTTP/2 on the httpx.Client it builds internally, and
# httpcore's HTTP/2 connection is NOT thread-safe. FastAPI runs sync route
# handlers in a threadpool, so concurrent requests hitting this shared client
# race on the same non-blocking socket and intermittently fail on Windows with
# WSAEWOULDBLOCK (httpx.ReadError: [WinError 10035]). httpx's HTTP/1.1 pool IS
# thread-safe, so we inject our own client pinned to HTTP/1.1. When a custom
# client is supplied, postgrest uses its timeout instead of
# DEFAULT_POSTGREST_CLIENT_TIMEOUT (120s), so we set it explicitly.
POSTGREST_CLIENT_TIMEOUT = 120  # seconds; matches postgrest's default

_client: Client | None = None


def get_supabase() -> Client:
    """Return the singleton service-role Supabase client."""
    global _client
    if _client is None:
        settings = get_settings()
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise RuntimeError("Supabase URL and service-role key must be configured")
        http_client = HttpxClient(
            timeout=POSTGREST_CLIENT_TIMEOUT,
            follow_redirects=True,
            http2=False,
        )
        options = ClientOptions(httpx_client=http_client)
        _client = create_client(
            settings.supabase_url, settings.supabase_service_role_key, options=options
        )
    return _client


def get_db() -> Client:
    """FastAPI dependency that provides the Supabase client."""
    return get_supabase()


def raise_for_error(result: Any, *, context: str = "database operation") -> None:
    """Translate a PostgREST error into a clean AppError.

    ``result`` is the PostgRESTResponse returned by supabase-py. When an error
    occurred the response object carries it (an APIError); raw details are logged
    server-side only and never exposed to the client.
    """
    error = getattr(result, "error", None)
    if error is not None:
        from app.core.logging import get_logger

        message = getattr(error, "message", None) or getattr(error, "details", None) or str(error)
        get_logger(__name__).error("Database %s failed: %s", context, message)
        raise AppError(
            f"{context} failed",
            code="database_error",
            status_code=500,
        )
