"""Emergency contact business logic.

Access model mirrors resident_documents: staff with manage handle any resident,
residents with manage_own only their own records.
"""

from __future__ import annotations

from supabase import Client

from app.common.authz import has_permission
from app.core.exceptions import ForbiddenError, NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.emergency_contacts.schemas import EmergencyContactCreate, EmergencyContactList, EmergencyContactOut, EmergencyContactUpdate
from app.residents.service import get_resident_by_user

_TABLE = "emergency_contacts"


def _own_resident_id(db: Client, user: dict) -> str:
    own = get_resident_by_user(db, user["id"])
    if own is None:
        raise ForbiddenError("No resident profile linked to this account", code="resident_not_linked")
    return str(own["id"])


def _can_manage(db: Client, user: dict, resident_id: str) -> bool:
    if has_permission(db, user, "emergency_contacts.manage"):
        return True
    if has_permission(db, user, "emergency_contacts.manage_own"):
        return _own_resident_id(db, user) == str(resident_id)
    return False


def create_contact(db: Client, user: dict, data: EmergencyContactCreate) -> EmergencyContactOut:
    if not _can_manage(db, user, str(data.resident_id)):
        raise ForbiddenError("You cannot manage contacts for this resident", code="not_your_resident")
    return EmergencyContactOut.model_validate(insert(db, _TABLE, data.model_dump(mode="json")))


def list_contacts(
    db: Client, user: dict, *, resident_id: str | None, page: int, per_page: int
) -> EmergencyContactList:
    if has_permission(db, user, "emergency_contacts.view"):
        scope = str(resident_id) if resident_id else None
    elif has_permission(db, user, "emergency_contacts.view_own"):
        scope = _own_resident_id(db, user)
    else:
        raise ForbiddenError("You cannot view emergency contacts", code="missing_permission")

    eq = {"resident_id": scope} if scope else None
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        eq=eq, order="created_at", desc=True,
    )
    return EmergencyContactList(items=[EmergencyContactOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def update_contact(db: Client, user: dict, contact_id: str, data: EmergencyContactUpdate) -> EmergencyContactOut:
    contact = get_by_id(db, _TABLE, contact_id)
    if contact is None:
        raise NotFoundError("Emergency contact not found", code="contact_not_found")
    if not _can_manage(db, user, contact["resident_id"]):
        raise ForbiddenError("You cannot manage this contact", code="not_your_resident")
    return EmergencyContactOut.model_validate(update(db, _TABLE, contact_id, data.model_dump(exclude_unset=True)))
