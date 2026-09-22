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


# Loc segments that are request-location markers, not field names — stripped
# before turning a Pydantic error's `loc` into a human-readable field name.
_LOC_PREFIXES = {"body", "query", "path", "header", "cookie"}

# Segments rendered fully uppercase in a field label (e.g. "resident_id" ->
# "Resident ID", not "Resident Id").
_LABEL_ACRONYMS = {"id", "otp", "ip", "url", "cors", "jwt"}

# Pydantic v2 error `type` prefix -> a plain-English word for what kind of
# value was expected. Used to build "<Field> must be a valid <word>" for
# type/parsing errors, which never say which field failed on their own.
_TYPE_WORDS = {
    "int": "number",
    "float": "number",
    "decimal": "number",
    "bool": "true/false value",
    "uuid": "ID",
    "date": "date",
    "datetime": "date and time",
    "string": "piece of text",
    "list": "list",
    "dict": "object",
    "json": "JSON value",
}


def _field_label(loc: tuple) -> str:
    """Turn a Pydantic error ``loc`` tuple into a human-readable field name.

    Drops the request-location prefix (``body``/``query``/...) and any array
    indices, and never returns a raw dotted/loc-style path.
    """
    parts = [p for p in loc if not isinstance(p, int)]
    if parts and parts[0] in _LOC_PREFIXES:
        parts = parts[1:]
    if not parts:
        return "Value"
    words = [w.upper() if w.lower() in _LABEL_ACRONYMS else w for w in str(parts[-1]).split("_")]
    label = " ".join(w for w in words if w)
    return (label[:1].upper() + label[1:]) if label else "Value"


def _humanize_validation_error(error: dict) -> str:
    """Turn one Pydantic v2 error dict into a safe, user-facing sentence.

    Never includes the submitted input value or a raw ``loc`` path — only a
    human field name (see ``_field_label``) and a plain-English reason.
    """
    field = _field_label(tuple(error.get("loc", ())))
    error_type = str(error.get("type", ""))
    raw_msg = str(error.get("msg", ""))

    if error_type == "value_error":
        # Pydantic prefixes a custom field-validator's ValueError with
        # "Value error, " — e.g. the password-policy messages. Those messages
        # are already specific and human-readable; just drop the prefix.
        message = raw_msg[len("Value error, "):] if raw_msg.startswith("Value error, ") else raw_msg
        return (message[:1].upper() + message[1:]) if message else f"{field} is invalid"

    if error_type == "missing":
        return f"{field} is required"

    if error_type == "extra_forbidden":
        return f"{field} is not a valid field"

    if error_type in {"string_too_short", "too_short"}:
        min_length = error.get("ctx", {}).get("min_length")
        if isinstance(min_length, int):
            unit = "character" if min_length == 1 else "characters"
            return f"{field} must be at least {min_length} {unit} long"
        return f"{field} is too short"

    if error_type in {"string_too_long", "too_long"}:
        max_length = error.get("ctx", {}).get("max_length")
        if isinstance(max_length, int):
            return f"{field} must be at most {max_length} characters long"
        return f"{field} is too long"

    if error_type in {"greater_than", "greater_than_equal", "less_than", "less_than_equal", "multiple_of"}:
        return f"{field} is out of the allowed range"

    if error_type in {"enum", "literal_error"}:
        return f"{field} must be one of the allowed values"

    if error_type == "json_invalid":
        return f"{field} must be valid JSON"

    if error_type.endswith("_parsing") or error_type.endswith("_type"):
        word = _TYPE_WORDS.get(error_type.split("_", 1)[0], "value")
        return f"{field} must be a valid {word}"

    # Fallback for any Pydantic error type not explicitly mapped above.
    # raw_msg is Pydantic's own wording; it never embeds the submitted value
    # or the raw loc path, so it is safe to combine with the field label.
    return f"{field}: {raw_msg}" if raw_msg else f"{field} is invalid"


def _validation_error_message(errors: list[dict]) -> str:
    if not errors:
        return "Request validation failed"
    return _humanize_validation_error(errors[0])


def register_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=_error_body(exc))

    @app.exception_handler(RequestValidationError)
    async def _validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Keep FastAPI's structured validation detail (errors) but surface a
        # specific, human-readable top-level message built from the first
        # error instead of a generic "Request validation failed" — see
        # _validation_error_message. errors are passed through _json_safe so
        # validator-raised exceptions (e.g. password policy) survive JSON
        # serialization.
        raw_errors = exc.errors()
        return JSONResponse(
            status_code=422,
            content={
                "detail": {
                    "code": "validation_error",
                    "message": _validation_error_message(raw_errors),
                    "errors": _json_safe(raw_errors),
                }
            },
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
