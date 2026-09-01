"""Maintenance ticket endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.maintenance_tickets import service
from app.maintenance_tickets.schemas import TicketCreate, TicketList, TicketOut, TicketUpdate

router = APIRouter(prefix="/maintenance-tickets", tags=["maintenance-tickets"])


@router.get("", response_model=TicketList, summary="List maintenance tickets")
def list_tickets(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: str | None = None,
    room_id: str | None = None,
    assigned_to: str | None = None,
    search: str | None = None,
    _: dict = Depends(require_permission("maintenance_tickets.view")),
    db: Client = Depends(get_db),
) -> TicketList:
    return service.list_tickets(db, page=page, per_page=per_page, status=status, room_id=room_id, assigned_to=assigned_to, search=search)


@router.post("", response_model=TicketOut, status_code=201, summary="Create a maintenance ticket")
def create(
    payload: TicketCreate,
    _: dict = Depends(require_permission("maintenance_tickets.create")),
    db: Client = Depends(get_db),
) -> TicketOut:
    return service.create(db, payload)


@router.patch("/{ticket_id}", response_model=TicketOut, summary="Update a maintenance ticket")
def update_ticket(
    ticket_id: str,
    payload: TicketUpdate,
    _: dict = Depends(require_permission("maintenance_tickets.update")),
    db: Client = Depends(get_db),
) -> TicketOut:
    return service.update_ticket(db, ticket_id, payload)
