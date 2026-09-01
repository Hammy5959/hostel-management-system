"""Room endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_permission
from app.rooms import service
from app.rooms.schemas import RoomCreate, RoomDetailOut, RoomList, RoomOut, RoomUpdate

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("", response_model=RoomList, summary="List rooms")
def list_rooms(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    floor_id: str | None = None,
    building_id: str | None = None,
    status: str | None = None,
    search: str | None = None,
    _: dict = Depends(require_permission("rooms.view")),
    db: Client = Depends(get_db),
) -> RoomList:
    return service.list_rooms(db, page=page, per_page=per_page, floor_id=floor_id, building_id=building_id, status=status, search=search)


@router.post("", response_model=RoomOut, status_code=201, summary="Create a room")
def create_room(
    payload: RoomCreate,
    _: dict = Depends(require_permission("rooms.create")),
    db: Client = Depends(get_db),
) -> RoomOut:
    return service.create_room(db, payload)


@router.get("/{room_id}", response_model=RoomOut, summary="Get a room")
def get_room(
    room_id: str,
    _: dict = Depends(require_permission("rooms.view")),
    db: Client = Depends(get_db),
) -> RoomOut:
    return service.get_room(db, room_id)


@router.get("/{room_id}/detail", response_model=RoomDetailOut, summary="Get room bed-management detail")
def get_room_detail(
    room_id: str,
    _: dict = Depends(require_permission("rooms.view")),
    db: Client = Depends(get_db),
) -> RoomDetailOut:
    return service.get_room_detail(db, room_id)


@router.patch("/{room_id}", response_model=RoomOut, summary="Update a room")
def update_room(
    room_id: str,
    payload: RoomUpdate,
    _: dict = Depends(require_permission("rooms.update")),
    db: Client = Depends(get_db),
) -> RoomOut:
    return service.update_room(db, room_id, payload)
