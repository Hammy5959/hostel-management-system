"""Resident document business logic.

Access model:
  - staff with resident_documents.manage  -> any resident's documents, + verify
  - staff with resident_documents.view    -> view any resident's documents
  - a resident with *_own permissions     -> only their own documents
Verification is a staff-only action.
"""

from __future__ import annotations

from datetime import datetime, timezone

from supabase import Client

from app.common.authz import has_permission
from app.core.exceptions import ForbiddenError, NotFoundError
from app.database.crud import get_by_id, insert, list_page, update
from app.database.supabase import raise_for_error
from app.resident_documents.schemas import DocumentCreate, DocumentList, DocumentOut, DocumentUpdate
from app.residents.service import get_resident_by_user

_TABLE = "resident_documents"


def _own_resident_id(db: Client, user: dict) -> str:
    own = get_resident_by_user(db, user["id"])
    if own is None:
        raise ForbiddenError("No resident profile linked to this account", code="resident_not_linked")
    return str(own["id"])


def _can_manage(db: Client, user: dict, resident_id: str) -> bool:
    if has_permission(db, user, "resident_documents.manage"):
        return True
    if has_permission(db, user, "resident_documents.manage_own"):
        return _own_resident_id(db, user) == str(resident_id)
    return False


def create_document(db: Client, user: dict, data: DocumentCreate) -> DocumentOut:
    if not _can_manage(db, user, str(data.resident_id)):
        raise ForbiddenError("You cannot manage documents for this resident", code="not_your_resident")
    return DocumentOut.model_validate(insert(db, _TABLE, data.model_dump(mode="json")))


def list_documents(db: Client, user: dict, *, resident_id: str | None, page: int, per_page: int) -> DocumentList:
    if has_permission(db, user, "resident_documents.view"):
        scope = str(resident_id) if resident_id else None
    elif has_permission(db, user, "resident_documents.view_own"):
        scope = _own_resident_id(db, user)
    else:
        raise ForbiddenError("You cannot view resident documents", code="missing_permission")

    eq = {"resident_id": scope} if scope else None
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page,
        eq=eq, order="uploaded_at", desc=True,
    )
    return DocumentList(items=[DocumentOut.model_validate(i) for i in items], total=total, page=page, per_page=per_page)


def update_document(db: Client, user: dict, document_id: str, data: DocumentUpdate) -> DocumentOut:
    doc = get_by_id(db, _TABLE, document_id)
    if doc is None:
        raise NotFoundError("Document not found", code="document_not_found")
    if not _can_manage(db, user, doc["resident_id"]):
        raise ForbiddenError("You cannot manage this document", code="not_your_resident")
    return DocumentOut.model_validate(update(db, _TABLE, document_id, data.model_dump(exclude_unset=True)))


def verify_document(db: Client, user: dict, document_id: str) -> DocumentOut:
    if not has_permission(db, user, "resident_documents.manage"):
        raise ForbiddenError("Only authorized staff can verify documents", code="missing_permission")
    doc = get_by_id(db, _TABLE, document_id)
    if doc is None:
        raise NotFoundError("Document not found", code="document_not_found")
    now_iso = datetime.now(timezone.utc).isoformat()
    res = db.table(_TABLE).update(
        {"verified": True, "verified_at": now_iso, "verified_by": user["id"]}
    ).eq("id", document_id).execute()
    if getattr(res, "error", None):
        raise_for_error(res, "verify document")
    return DocumentOut.model_validate(res.data[0])
