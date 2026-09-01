"""Human-readable unique number generators for business documents."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone


def generate_number(prefix: str) -> str:
    """Generate a number like ``ADM-20260812-A1B2C3``."""
    date_part = datetime.now(timezone.utc).strftime("%Y%m%d")
    rand = secrets.token_hex(3).upper()
    return f"{prefix}-{date_part}-{rand}"
