"""Resident document endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_any_permission, require_permission
from app.resident_documents import service
from app.resident_documents.schemas import DocumentCreate, DocumentList, DocumentOut, DocumentUpdate

router = APIRouter(prefix="/resident-documents", tags=["resident-documents"])


@router.get("", response_model=DocumentList, summary="List resident documents")
def list_documents(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    resident_id: str | None = None,
    user: dict = Depends(require_any_permission("resident_documents.view", "resident_documents.view_own")),
    db: Client = Depends(get_db),
) -> DocumentList:
    return service.list_documents(db, user, resident_id=resident_id, page=page, per_page=per_page)


@router.post("", response_model=DocumentOut, status_code=201, summary="Upload a resident document")
def create_document(
    payload: DocumentCreate,
    user: dict = Depends(require_any_permission("resident_documents.manage", "resident_documents.manage_own")),
    db: Client = Depends(get_db),
) -> DocumentOut:
    return service.create_document(db, user, payload)


@router.patch("/{document_id}", response_model=DocumentOut, summary="Update a document")
def update_document(
    document_id: str,
    payload: DocumentUpdate,
    user: dict = Depends(require_any_permission("resident_documents.manage", "resident_documents.manage_own")),
    db: Client = Depends(get_db),
) -> DocumentOut:
    return service.update_document(db, user, document_id, payload)


@router.post("/{document_id}/verify", response_model=DocumentOut, summary="Verify a document (staff)")
def verify_document(
    document_id: str,
    user: dict = Depends(require_permission("resident_documents.manage")),
    db: Client = Depends(get_db),
) -> DocumentOut:
    return service.verify_document(db, user, document_id)
