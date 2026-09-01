"""Authentication endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from supabase import Client

from app.api.deps import get_db
from app.auth import service
from app.auth.schemas import OTPRequest, OTPRequestResponse, OTPVerify, TokenResponse, UserOut
from app.core.dependencies import get_current_user
from app.users.schemas import UserSelfUpdate
from app.users.service import update_self

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/request-otp",
    response_model=OTPRequestResponse,
    summary="Verify password, then request a login OTP",
)
def request_otp(payload: OTPRequest, db: Client = Depends(get_db)) -> dict:
    """Step 1 of login: verify the email+password, then issue an OTP.
    The JWT is only issued by verify-otp after the OTP succeeds."""
    return service.request_otp(db, payload.email, payload.password)


@router.post("/verify-otp", response_model=TokenResponse, summary="Verify OTP and obtain a JWT")
def verify_otp(payload: OTPVerify, db: Client = Depends(get_db)) -> TokenResponse:
    return service.verify_otp(db, payload.email, payload.otp)


@router.get("/me", response_model=UserOut, summary="Current authenticated user")
def me(user: dict = Depends(get_current_user)) -> dict:
    return user


@router.patch("/me", response_model=UserOut, summary="Update the current user's own profile")
def update_me(
    payload: UserSelfUpdate,
    user: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> UserOut:
    """Self-service profile update. Role, status and email can never be changed
    here — no privilege escalation is possible."""
    return update_self(db, user, payload)
