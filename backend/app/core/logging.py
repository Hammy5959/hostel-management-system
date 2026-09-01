"""Logging configuration for the backend.

Terminal/console output is used for OTP delivery during development so the
delivery channel can later be swapped for email/SMS without touching the auth
API contract (see app.auth.otp).
"""

from __future__ import annotations

import logging
import sys

_CONFIGURED = False

_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"


def setup_logging(*, level: int | None = None) -> None:
    """Configure root logging once (idempotent)."""
    global _CONFIGURED
    if _CONFIGURED:
        return

    root = logging.getLogger()
    root.setLevel(level or logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_FORMAT))
    root.addHandler(handler)

    # Supabase/httpx dependency chatter is noisy; keep it above our default level.
    logging.getLogger("supabase").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Return a module logger, ensuring logging is configured first."""
    setup_logging()
    return logging.getLogger(name)
