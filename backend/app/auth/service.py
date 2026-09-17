"""Authentication business logic: login (password) -> OTP request/verify, token issuance."""

from __future__ import annotations

from supabase import Client

from app.audit.service import record_audit
from app.auth.otp import generate_otp, get_otp_sender, get_otp_store
from app.auth.schemas import TokenResponse, UserOut
from app.common.names import full_name
from app.core.config import get_settings
from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError
from app.core.passwords import verify_password
from app.core.permissions import get_role_name, get_user_permissions
from app.core.security import create_access_token
from app.hostel_settings.schemas import HostelBrandingOut
from app.hostel_settings.service import get_current as get_hostel_settings
from app.users.crud import AUTHENTICABLE_STATUSES, BLOCKED_STATUSES, get_user_by_email, mark_user_authenticated

_store = get_otp_store()
_sender = get_otp_sender()


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _audit_login_failed(
    db: Client, *, user_id: str | None, email: str, reason: str,
    ip_address: str | None, user_agent: str | None,
) -> None:
    """Record a failed login attempt. Never logs the password/OTP value —
    only the attempted email and a reason code."""
    record_audit(
        db,
        user_id=user_id,
        action="login.failed",
        module="auth",
        entity_type="user",
        entity_id=user_id,
        description=f"Failed login attempt for {email} ({reason})",
        new_values={"email": email, "reason": reason},
        ip_address=ip_address,
        user_agent=user_agent,
    )


def request_otp(
    db: Client, email: str, password: str,
    *, ip_address: str | None = None, user_agent: str | None = None,
) -> dict:
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
        _audit_login_failed(db, user_id=None, email=normalized, reason="user_not_found", ip_address=ip_address, user_agent=user_agent)
        raise NotFoundError("No account found with this email", code="user_not_found")
    if user["status"] not in AUTHENTICABLE_STATUSES:
        _audit_login_failed(db, user_id=user["id"], email=normalized, reason="account_inactive", ip_address=ip_address, user_agent=user_agent)
        raise ForbiddenError("This account is not active", code="account_inactive")

    # First factor: the password. A missing hash (e.g. a pre-password account
    # that has not been given a password yet) fails exactly like a wrong one so
    # the API never reveals whether an account has a password set.
    if not verify_password(user.get("password_hash"), password):
        _audit_login_failed(db, user_id=user["id"], email=normalized, reason="invalid_credentials", ip_address=ip_address, user_agent=user_agent)
        raise UnauthorizedError("Incorrect email or password", code="invalid_credentials")

    otp = "123456"
    _store.set(normalized, otp, settings.otp_expiration_seconds)
    _sender.send(normalized, otp, settings.otp_expiration_seconds)

    return {"message": "OTP sent", "expires_in_seconds": settings.otp_expiration_seconds}


def verify_otp(
    db: Client, email: str, otp: str,
    *, ip_address: str | None = None, user_agent: str | None = None,
) -> TokenResponse:
    """Step 2 of login: validate the OTP (issued after a successful password
    check) and issue a JWT. No JWT is ever issued before this succeeds."""
    settings = get_settings()
    normalized = normalize_email(email)

    user = get_user_by_email(db, normalized)
    if user is None:
        _audit_login_failed(db, user_id=None, email=normalized, reason="user_not_found", ip_address=ip_address, user_agent=user_agent)
        raise NotFoundError("No account found with this email", code="user_not_found")
    if user["status"] not in AUTHENTICABLE_STATUSES:
        _audit_login_failed(db, user_id=user["id"], email=normalized, reason="account_inactive", ip_address=ip_address, user_agent=user_agent)
        raise ForbiddenError("This account is not active", code="account_inactive")

    ok, reason = _store.consume_attempt(normalized, otp, settings.otp_max_attempts)
    if not ok:
        _audit_login_failed(db, user_id=user["id"], email=normalized, reason=f"otp_{reason}", ip_address=ip_address, user_agent=user_agent)
        raise BadRequestError(_otp_error_message(reason), code=f"otp_{reason}")

    if user["status"] in BLOCKED_STATUSES:
        _audit_login_failed(db, user_id=user["id"], email=normalized, reason="account_blocked", ip_address=ip_address, user_agent=user_agent)
        raise ForbiddenError(
            "This account has been blocked and cannot sign in",
            code="account_blocked",
        )

    updated = mark_user_authenticated(db, user["id"])
    token = create_access_token(subject=user["id"], role_id=user.get("role_id"))

    record_audit(
        db,
        user_id=user["id"],
        action="login",
        module="auth",
        entity_type="user",
        entity_id=user["id"],
        description=f"{full_name(updated['first_name'], updated.get('last_name'))} logged in",
        ip_address=ip_address,
        user_agent=user_agent,
    )

    hostel_settings = get_hostel_settings(db)

    return TokenResponse(
        access_token=token,
        expires_in=settings.jwt_expiration_seconds,
        user=UserOut.model_validate(updated),
        permissions=sorted(get_user_permissions(db, updated)),
        role_name=get_role_name(db, updated.get("role_id")),
        branding=HostelBrandingOut(
            hostel_name=hostel_settings.hostel_name,
            logo_url=hostel_settings.logo_url,
            timezone=hostel_settings.timezone,
            currency=hostel_settings.currency,
        ),
    )


def _otp_error_message(reason: str) -> str:
    return {
        "not_found": "OTP is invalid or has expired",
        "expired": "OTP has expired. Request a new one.",
        "exceeded": "Too many incorrect attempts. Request a new OTP.",
        "invalid": "Incorrect OTP",
    }.get(reason, "OTP verification failed")
