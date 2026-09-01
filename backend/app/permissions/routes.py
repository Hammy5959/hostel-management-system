"""Permission catalog endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from supabase import Client

from app.api.deps import get_db
from app.core.permissions import require_any_permission
from app.permissions import crud
from app.permissions.schemas import PermissionOut

router = APIRouter(prefix="/permissions", tags=["permissions"])


@router.get("", response_model=list[PermissionOut], summary="List the permission catalog")
def list_permissions(
    module: str | None = None,
    _: dict = Depends(require_any_permission("permissions.view", "roles.manage")),
    db: Client = Depends(get_db),
) -> list[PermissionOut]:
    return [PermissionOut.model_validate(p) for p in crud.list_permissions(db, module=module)]
