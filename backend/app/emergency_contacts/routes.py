"""Emergency contact endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_any_permission
from app.emergency_contacts import service
from app.emergency_contacts.schemas import EmergencyContactCreate, EmergencyContactList, EmergencyContactOut, EmergencyContactUpdate

router = APIRouter(prefix="/emergency-contacts", tags=["emergency-contacts"])


@router.get("", response_model=EmergencyContactList, summary="List emergency contacts")
def list_contacts(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    resident_id: str | None = None,
    user: dict = Depends(require_any_permission("emergency_contacts.view", "emergency_contacts.view_own")),
    db: Client = Depends(get_db),
) -> EmergencyContactList:
    return service.list_contacts(db, user, resident_id=resident_id, page=page, per_page=per_page)


@router.post("", response_model=EmergencyContactOut, status_code=201, summary="Add an emergency contact")
def create_contact(
    payload: EmergencyContactCreate,
    user: dict = Depends(require_any_permission("emergency_contacts.manage", "emergency_contacts.manage_own")),
    db: Client = Depends(get_db),
) -> EmergencyContactOut:
    return service.create_contact(db, user, payload)


@router.patch("/{contact_id}", response_model=EmergencyContactOut, summary="Update an emergency contact")
def update_contact(
    contact_id: str,
    payload: EmergencyContactUpdate,
    user: dict = Depends(require_any_permission("emergency_contacts.manage", "emergency_contacts.manage_own")),
    db: Client = Depends(get_db),
) -> EmergencyContactOut:
    return service.update_contact(db, user, contact_id, payload)
