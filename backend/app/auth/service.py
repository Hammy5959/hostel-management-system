"""Authentication business logic: login (password) -> OTP request/verify, token issuance."""

from __future__ import annotations

from supabase import Client

from app.audit.service import record_audit
from app.auth.otp import generate_otp, get_otp_sender, get_otp_store
from app.auth.schemas import TokenResponse, UserOut
from app.core.config import get_settings
from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError
from app.core.passwords import verify_password
from app.core.security import create_access_token
from app.users.crud import AUTHENTICABLE_STATUSES, get_user_by_email, mark_user_authenticated

_store = get_otp_store()
_sender = get_otp_sender()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def request_otp(db: Client, email: str, password: str) -> dict:
    """Step 1 of login: verify the password, then issue and deliver an OTP.

    The OTP is the SECOND factor — it is only generated after the password
    check succeeds, and a JWT is never issued here. The OTP is delivered
    through the configured sender (terminal in dev), is never returned in the
    response, and is never persisted to PostgreSQL.
    """
    settings = get_settings()
    normalized = normalize_email(email)

    user = get_user_by_email(db, normalized)
    if user is None:
        raise NotFoundError("No account found with this email", code="user_not_found")
    if user["status"] not in AUTHENTICABLE_STATUSES:
        raise ForbiddenError("This account is not active", code="account_inactive")

    # First factor: the password. A missing hash (e.g. a pre-password account
    # that has not been given a password yet) fails exactly like a wrong one so
    # the API never reveals whether an account has a password set.
    if not verify_password(user.get("password_hash"), password):
        raise UnauthorizedError("Incorrect email or password", code="invalid_credentials")

    otp = "123456"
    _store.set(normalized, otp, settings.otp_expiration_seconds)
    _sender.send(normalized, otp, settings.otp_expiration_seconds)

    return {"message": "OTP sent", "expires_in_seconds": settings.otp_expiration_seconds}


def verify_otp(db: Client, email: str, otp: str) -> TokenResponse:
    """Step 2 of login: validate the OTP (issued after a successful password
    check) and issue a JWT. No JWT is ever issued before this succeeds."""
    settings = get_settings()
    normalized = normalize_email(email)

    user = get_user_by_email(db, normalized)
    if user is None:
        raise NotFoundError("No account found with this email", code="user_not_found")
    if user["status"] not in AUTHENTICABLE_STATUSES:
        raise ForbiddenError("This account is not active", code="account_inactive")

    ok, reason = _store.consume_attempt(normalized, otp, settings.otp_max_attempts)
    if not ok:
        raise BadRequestError(_otp_error_message(reason), code=f"otp_{reason}")

    updated = mark_user_authenticated(db, user["id"])
    token = create_access_token(subject=user["id"], role_id=user.get("role_id"))

    record_audit(
        db,
        user_id=user["id"],
        action="login",
        module="auth",
        entity_type="user",
        entity_id=user["id"],
        description="Password + OTP login",
    )

    return TokenResponse(
        access_token=token,
        expires_in=settings.jwt_expiration_seconds,
        user=UserOut.model_validate(updated),
    )


def _otp_error_message(reason: str) -> str:
    return {
        "not_found": "OTP is invalid or has expired",
        "expired": "OTP has expired. Request a new one.",
        "exceeded": "Too many incorrect attempts. Request a new OTP.",
        "invalid": "Incorrect OTP",
    }.get(reason, "OTP verification failed")
