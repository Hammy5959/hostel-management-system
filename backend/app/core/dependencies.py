"""Reusable authentication/authorization dependencies.

``get_current_user`` must be used by any route that needs the authenticated
user. Permission checks (Phase 3) build on top of it.
"""

from __future__ import annotations

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from app.api.deps import get_db
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import decode_access_token
from app.users.crud import BLOCKED_STATUSES, get_user_by_id

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Client = Depends(get_db),
) -> dict:
    """Resolve the authenticated user from the Authorization bearer token.

    Returns the public.users row as a dict. Raises 401 on missing/invalid
    tokens and 403 if the account has been disabled.
    """
    if credentials is None:
        raise UnauthorizedError("Missing authentication token", code="missing_token")

    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise UnauthorizedError("Invalid or expired token", code="invalid_token")

    subject = payload.get("sub")
    if not subject:
        raise UnauthorizedError("Invalid token payload", code="invalid_token")

    user = get_user_by_id(db, subject)
    if user is None:
        raise UnauthorizedError("Account no longer exists", code="user_not_found")
    if user.get("status") in BLOCKED_STATUSES:
        raise ForbiddenError("This account is disabled", code="account_disabled")

    return user
