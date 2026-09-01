"""Application error types and FastAPI exception handlers.

Every error that leaves the API is translated into a consistent envelope:

    {"detail": {"code": "...", "message": "..."}}

Raw database/PostgREST errors are never passed through to the client.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError as PostgrestAPIError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


def _json_safe(value: Any) -> Any:
    """Recursively make a value JSON-serializable.

    Pydantic v2 puts the exception instance raised by a field validator into
    the error's ``ctx`` (e.g. the password-policy ValueError). JSONResponse
    cannot serialize an exception, so convert any exception (and any container
    holding one) to its message.
    """
    if isinstance(value, Exception):
        return str(value)
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v) for v in value]
    return value


class AppError(Exception):
    """Base application error carrying an HTTP status and a stable machine code."""

    status_code: int = 500
    code: str = "internal_error"
    message: str = "Internal server error"

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        status_code: int | None = None,
    ) -> None:
        if message is not None:
            self.message = message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
        super().__init__(self.message)


class BadRequestError(AppError):
    status_code = 400
    code = "bad_request"


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"
    message = "Authentication required"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"
    message = "You do not have permission to perform this action"


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class UnprocessableError(AppError):
    status_code = 422
    code = "unprocessable_entity"


def _error_body(exc: AppError) -> dict:
    return {"detail": {"code": exc.code, "message": exc.message}}


def _map_db_error(code: str, raw_message: str) -> tuple[int, str, str]:
    """Map a PostgreSQL SQLSTATE code to (http_status, app_code, safe_message)."""
    if code == "23505":
        return 409, "conflict", "A record with the same value already exists"
    if code == "23503":
        return 409, "conflict", "Referenced record does not exist"
    if code == "23514":
        return 422, "validation_error", "Value violates a database constraint"
    if code in ("22P02", "22001"):
        return 422, "validation_error", "Invalid value format"
    if code == "42501":
        return 500, "database_error", "Database access is not configured for this role"
    if code == "42703":
        return 500, "database_error", "Database column does not exist"
    return 500, "database_error", "Database operation failed"


def _code_for_status(status: int) -> str:
    mapping = {
        400: "bad_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        405: "method_not_allowed",
        409: "conflict",
        422: "validation_error",
        429: "too_many_requests",
    }
    return mapping.get(status, "http_error")


def register_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=_error_body(exc))

    @app.exception_handler(RequestValidationError)
    async def _validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Keep FastAPI's structured validation detail but wrap it consistently.
        # errors are passed through _json_safe so validator-raised exceptions
        # (e.g. password policy) survive JSON serialization.
        return JSONResponse(
            status_code=422,
            content={"detail": {"code": "validation_error", "message": "Request validation failed", "errors": _json_safe(exc.errors())}},
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else "Request failed"
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": {"code": _code_for_status(exc.status_code), "message": message}},
        )

    @app.exception_handler(PostgrestAPIError)
    async def _db_error_handler(request: Request, exc: PostgrestAPIError) -> JSONResponse:
        # PostgREST failures (permission denied, constraint violations) are
        # logged server-side with their real detail but never exposed to clients.
        # Known PostgreSQL SQLSTATE codes are mapped to clean HTTP errors.
        message = getattr(exc, "message", None) or getattr(exc, "details", None) or str(exc)
        code = getattr(exc, "code", None) or ""
        logger.error("Database error on %s %s: %s", request.method, request.url.path, message)
        status, app_code, client_message = _map_db_error(str(code), message)
        return JSONResponse(
            status_code=status,
            content=_error_body(AppError(client_message, code=app_code, status_code=status)),
        )

    @app.exception_handler(Exception)
    async def _unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        # Never leak internals; log the real traceback server-side.
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content=_error_body(AppError("An unexpected error occurred", code="internal_error", status_code=500)),
        )
