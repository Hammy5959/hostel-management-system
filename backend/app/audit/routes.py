"""Audit log endpoints (staff/super-admin only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_db
from app.audit.schemas import AuditLogList
from app.core.permissions import require_permission
from app.database.crud import list_page

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])

_TABLE = "audit_logs"


@router.get("", response_model=AuditLogList, summary="List audit logs")
def list_audit_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    action: str | None = None,
    module: str | None = None,
    entity_type: str | None = None,
    user_id: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    _: dict = Depends(require_permission("audit_logs.view")),
    db: Client = Depends(get_db),
) -> AuditLogList:
    eq: dict = {}
    if action:
        eq["action"] = action
    if module:
        eq["module"] = module
    if entity_type:
        eq["entity_type"] = entity_type
    if user_id:
        eq["user_id"] = user_id
    items, total = list_page(
        db, _TABLE, page=page, per_page=per_page, eq=eq or None,
        gte={"created_at": date_from} if date_from else None,
        lte={"created_at": date_to} if date_to else None,
        order="created_at", desc=True,
    )
    return AuditLogList(items=items, total=total, page=page, per_page=per_page)
