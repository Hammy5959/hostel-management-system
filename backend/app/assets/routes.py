"""Asset endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.assets import service
from app.assets.schemas import AssetCreate, AssetList, AssetOut, AssetUpdate
from app.core.permissions import require_permission

router = APIRouter(prefix="/assets", tags=["assets"])


@router.get("", response_model=AssetList, summary="List assets")
def list_assets(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: str | None = None,
    category_id: str | None = None,
    search: str | None = None,
    _: dict = Depends(require_permission("assets.view")),
    db: Client = Depends(get_db),
) -> AssetList:
    return service.list_assets(db, page=page, per_page=per_page, status=status, category_id=category_id, search=search)


@router.post("", response_model=AssetOut, status_code=201, summary="Register an asset")
def create(
    payload: AssetCreate,
    _: dict = Depends(require_permission("assets.manage")),
    db: Client = Depends(get_db),
) -> AssetOut:
    return service.create(db, payload)


@router.get("/{asset_id}", response_model=AssetOut, summary="Get an asset")
def get(
    asset_id: str,
    _: dict = Depends(require_permission("assets.view")),
    db: Client = Depends(get_db),
) -> AssetOut:
    return service.get(db, asset_id)


@router.patch("/{asset_id}", response_model=AssetOut, summary="Update an asset")
def update(
    asset_id: str,
    payload: AssetUpdate,
    _: dict = Depends(require_permission("assets.manage")),
    db: Client = Depends(get_db),
) -> AssetOut:
    return service.update(db, asset_id, payload)
