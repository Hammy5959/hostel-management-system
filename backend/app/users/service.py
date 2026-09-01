"""User account business logic.

Lifecycle rules
---------------
- **Create**: role must exist and be active; email unique (DB-backed).
- **Admin update** (users.update): name, phone, avatar, email and role.
  Privilege escalation is blocked: only a super_admin may assign the
  super_admin role, and an actor may not change their own role here.
- **Self update** (PATCH /auth/me): first/last name, phone, avatar only —
  never role, status or email.
- **Status**: inactive/suspended block authentication; a user may not
  deactivate themselves; the super_admin account may not be deactivated.
- **Delete**: SOFT DELETE — sets status='deleted' (archive). Physical delete
  would CASCADE to staff/notifications, SET NULL resident/audit/actor links
  and destroy historical identity; soft delete preserves everything.
"""

from __future__ import annotations

from supabase import Client

from app.audit.service import record_audit
from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.core.passwords import hash_password
from app.core.permissions import SUPER_ADMIN_ROLE, is_super_admin
from app.roles import crud as roles_crud
from app.users import crud
from app.users.schemas import UserCreate, UserList, UserOut, UserSelfUpdate, UserStatusUpdate, UserUpdate

# Statuses that prevent an account from authenticating (see users.crud).
BLOCKED_STATUSES = crud.BLOCKED_STATUSES


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _require_role(db: Client, role_id: str) -> dict:
    role = roles_crud.get_role(db, role_id)
    if role is None:
        raise NotFoundError("Role not found", code="role_not_found")
    if not role["is_active"]:
        raise BadRequestError("Role is inactive", code="role_inactive")
    return role


def create_user(db: Client, data: UserCreate, actor: dict | None = None) -> UserOut:
    _require_role(db, str(data.role_id))
    payload = data.model_dump(mode="json")
    # The password never reaches the database in plaintext: pop it out of the
    # request payload and store only its Argon2id hash.
    password = payload.pop("password")
    payload["password_hash"] = hash_password(password)
    payload["email"] = _normalize_email(payload["email"])
    user = crud.create_user(db, payload)
    record_audit(
        db,
        user_id=actor["id"] if actor else None,
        action="user.create",
        module="users",
        entity_type="user",
        entity_id=user["id"],
        description=f"Created user {user['email']}",
        new_values={"email": user["email"], "role_id": user["role_id"]},
    )
    return UserOut.model_validate(user)


def get_user(db: Client, user_id: str) -> UserOut:
    user = crud.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User not found", code="user_not_found")
    return UserOut.model_validate(user)


def list_users(db: Client, *, page: int, per_page: int, search: str | None, role_id: str | None, status: str | None) -> UserList:
    items, total = crud.list_users(
        db,
        page=page,
        per_page=per_page,
        search=search,
        role_id=role_id,
        status=status,
    )
    return UserList(items=[UserOut.model_validate(u) for u in items], total=total, page=page, per_page=per_page)


def update_user(db: Client, user_id: str, data: UserUpdate, actor: dict | None = None) -> UserOut:
    user = crud.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User not found", code="user_not_found")
    # mode="json" serializes the Pydantic UUID role_id to a string so it can be
    # sent through supabase/httpx (raw UUID objects are not JSON-serializable).
    payload = data.model_dump(exclude_unset=True, mode="json")
    if not payload:
        return UserOut.model_validate(user)

    if "email" in payload:
        payload["email"] = _normalize_email(payload["email"])
        duplicate = crud.get_user_by_email(db, payload["email"])
        if duplicate is not None and duplicate["id"] != user_id:
            raise ConflictError("A user with this email already exists", code="email_exists")
        # A changed email must be re-verified on the next OTP login.
        payload["email_verified"] = False

    if "role_id" in payload:
        target_role = _require_role(db, str(payload["role_id"]))
        if target_role["name"] == SUPER_ADMIN_ROLE and not is_super_admin(db, actor or {}):
            raise ForbiddenError(
                "Only a super_admin can assign the super_admin role",
                code="super_admin_assignment_denied",
            )
        if actor is not None and actor["id"] == user_id:
            raise ForbiddenError(
                "You cannot change your own role through this endpoint",
                code="self_role_change_denied",
            )

    updated = crud.update_user(db, user_id, payload)
    _audit_user_update(db, user, updated, payload, actor)
    return UserOut.model_validate(updated)


def _audit_user_update(db: Client, old_user: dict, updated: dict, payload: dict, actor: dict | None) -> None:
    actor_id = actor["id"] if actor else None

    if "role_id" in payload:
        old_role = roles_crud.get_role(db, str(old_user["role_id"])) if old_user.get("role_id") else None
        new_role = roles_crud.get_role(db, str(payload["role_id"]))
        record_audit(
            db, user_id=actor_id, action="user.role_changed", module="users",
            entity_type="user", entity_id=old_user["id"],
            description=f"Changed role of {old_user['email']} from {old_role['name'] if old_role else 'none'} to {new_role['name']}",
            old_values={"role_id": old_user.get("role_id"), "role_name": old_role["name"] if old_role else None},
            new_values={"role_id": payload["role_id"], "role_name": new_role["name"]},
        )

    changed = {k: v for k, v in payload.items() if k != "role_id" and k != "email_verified"}
    if changed:
        record_audit(
            db, user_id=actor_id, action="user.update", module="users",
            entity_type="user", entity_id=old_user["id"],
            description=f"Updated user {old_user['email']}",
            old_values={k: old_user.get(k) for k in changed},
            new_values=changed,
        )


def update_self(db: Client, user: dict, data: UserSelfUpdate) -> UserOut:
    """Self-service profile update. role/status/email are never touched."""
    payload = data.model_dump(exclude_unset=True)
    if not payload:
        return UserOut.model_validate(user)
    updated = crud.update_user(db, user["id"], payload)
    record_audit(
        db,
        user_id=user["id"],
        action="user.update",
        module="users",
        entity_type="user",
        entity_id=user["id"],
        description=f"Updated own profile ({user['email']})",
        old_values={k: user.get(k) for k in payload},
        new_values=payload,
    )
    return UserOut.model_validate(updated)


def set_user_status(db: Client, user_id: str, data: UserStatusUpdate, actor: dict | None = None) -> UserOut:
    user = crud.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User not found", code="user_not_found")

    if data.status in BLOCKED_STATUSES:
        if actor is not None and user_id == actor["id"]:
            raise BadRequestError("You cannot deactivate your own account", code="self_status_change_denied")
        if is_super_admin(db, user):
            raise ConflictError("The super_admin account cannot be deactivated", code="super_admin_locked")

    updated = crud.update_user(db, user_id, {"status": data.status})
    record_audit(
        db,
        user_id=actor["id"] if actor else None,
        action="user.status",
        module="users",
        entity_type="user",
        entity_id=user_id,
        description=f"Changed status of {user['email']} to {data.status}",
        old_values={"status": user.get("status")},
        new_values={"status": data.status},
    )
    return UserOut.model_validate(updated)


def delete_user(db: Client, user_id: str, actor: dict | None = None) -> UserOut:
    """Soft-delete / archive a user account.

    Sets status='deleted' instead of a physical DELETE. This preserves the
    staff profile (FK CASCADE would remove it), the resident link (FK SET NULL
    would sever it), audit history and all actor references, while permanently
    blocking authentication.
    """
    user = crud.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError("User not found", code="user_not_found")

    if actor is not None and user_id == actor["id"]:
        raise BadRequestError("You cannot delete your own account", code="self_delete_denied")
    if is_super_admin(db, user):
        raise ConflictError("The super_admin account cannot be deleted", code="super_admin_locked")

    updated = crud.update_user(db, user_id, {"status": "deleted"})
    record_audit(
        db,
        user_id=actor["id"] if actor else None,
        action="user.deleted",
        module="users",
        entity_type="user",
        entity_id=user_id,
        description=f"Deleted (archived) user {user['email']}",
        old_values={"status": user.get("status"), "email": user["email"]},
        new_values={"status": "deleted"},
    )
    return UserOut.model_validate(updated)
