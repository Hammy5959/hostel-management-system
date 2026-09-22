"""Upload endpoints (Supabase Storage relay)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from supabase import Client

from app.api.deps import get_db
from app.core.dependencies import get_current_user
from app.uploads import service

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("/profile-photo", summary="Upload a profile photo")
async def upload_profile_photo(
    file: UploadFile = File(...),
    _: dict = Depends(get_current_user),
    db: Client = Depends(get_db),
) -> dict:
    url = await service.upload_profile_photo(db, file)
    return {"url": url}
