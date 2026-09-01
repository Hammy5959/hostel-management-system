"""Helpers for invoking Postgres RPC functions with clean error mapping.

Transaction-critical flows (bed allocation, transfer, check-in/out, payment)
run as database functions. When they RAISE EXCEPTION 'known_tag', PostgREST
surfaces that tag as the error message; we translate it here.
"""

from __future__ import annotations

from postgrest.exceptions import APIError
from supabase import Client

from app.core.exceptions import AppError
from app.core.logging import get_logger

logger = get_logger(__name__)


def rpc_call(
    db: Client,
    function: str,
    params: dict,
    error_map: dict[str, tuple[int, str, str]] | None = None,
) -> list[dict]:
    """Invoke ``function`` and return the resulting rows as a list of dicts."""
    try:
        res = db.rpc(function, params).execute()
    except APIError as exc:
        message = getattr(exc, "message", "") or getattr(exc, "details", "") or str(exc)
        mapping = error_map or {}
        if message in mapping:
            status, code, client_message = mapping[message]
            raise AppError(client_message, code=code, status_code=status)
        logger.error("RPC %s failed: %s", function, message)
        raise AppError("Operation failed", code="database_error", status_code=500)
    return res.data or []


def rpc_scalar(
    db: Client,
    function: str,
    params: dict | None = None,
) -> int | float:
    """Invoke a function returning a scalar (used for report sums)."""
    try:
        res = db.rpc(function, params or {}).execute()
    except APIError as exc:
        message = getattr(exc, "message", "") or str(exc)
        logger.error("RPC %s failed: %s", function, message)
        raise AppError("Report query failed", code="database_error", status_code=500)
    data = res.data
    if isinstance(data, list):
        return data[0] if data else 0
    return data if data is not None else 0
