"""Image uploads relayed to Supabase Storage.

The frontend has no direct Supabase access (no anon key, no Supabase Auth
session — this app uses its own JWT/OTP auth), so uploads go through the
backend's existing service-role Supabase client, which bypasses storage RLS
entirely. The `profile-photos` bucket is public, so uploaded files are
servable via a plain public URL with no signing needed.
"""

from __future__ import annotations

import uuid

from fastapi import UploadFile
from supabase import Client

from app.core.exceptions import BadRequestError

BUCKET = "profile-photos"
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_CONTENT_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
}


async def upload_profile_photo(db: Client, file: UploadFile) -> str:
    content_type = file.content_type or ""
    ext = ALLOWED_CONTENT_TYPES.get(content_type)
    if ext is None:
        raise BadRequestError(
            "Only PNG, JPEG, WEBP, or GIF images are allowed", code="invalid_file_type"
        )

    data = await file.read()
    if not data:
        raise BadRequestError("Uploaded file is empty", code="empty_file")
    if len(data) > MAX_FILE_SIZE:
        raise BadRequestError("Image must be 5MB or smaller", code="file_too_large")

    path = f"residents/{uuid.uuid4()}.{ext}"
    db.storage.from_(BUCKET).upload(
        path, data, file_options={"content-type": content_type, "upsert": "true"}
    )
    return db.storage.from_(BUCKET).get_public_url(path)
