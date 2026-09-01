"""Passwordless OTP authentication primitives.

Design notes
------------
- OTPs are 6-digit (configurable), ephemeral, expire after a configured TTL,
  limited in verification attempts, and are NEVER persisted to PostgreSQL.
- They are stored only in server-side memory (a thread-safe store) so the
  delivery channel can later move to email/SMS without changing the auth API
  contract: swap the OTPSender implementation.
- OTP values never appear in API responses and are never logged.
"""

from __future__ import annotations

import hmac
import secrets
import threading
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class OTPRecord:
    otp: str
    expires_at: float  # unix timestamp
    attempts: int = 0
    created_at: float = field(default_factory=time.time)


class OTPStore:
    """In-memory, thread-safe OTP store keyed by normalized email.

    A real deployment with multiple API instances should back this with a
    shared cache (e.g. Redis) implementing the same interface.
    """

    def __init__(self) -> None:
        self._records: dict[str, OTPRecord] = {}
        self._lock = threading.Lock()

    def _prune_locked(self, now: float) -> None:
        for key in [k for k, r in self._records.items() if r.expires_at <= now]:
            del self._records[key]

    def set(self, email: str, otp: str, ttl_seconds: int) -> None:
        now = time.time()
        with self._lock:
            self._prune_locked(now)
            self._records[email] = OTPRecord(otp=otp, expires_at=now + ttl_seconds)

    def consume_attempt(self, email: str, otp: str, max_attempts: int) -> tuple[bool, str]:
        """Atomically validate an OTP attempt.

        Returns ``(ok, reason)`` where reason is one of:
        ``ok``, ``not_found``, ``expired``, ``invalid``, ``exceeded``.
        On success the record is consumed (deleted) so it cannot be reused.
        """
        now = time.time()
        with self._lock:
            rec = self._records.get(email)
            if rec is None:
                return False, "not_found"
            if rec.expires_at <= now:
                del self._records[email]
                return False, "expired"
            if rec.attempts >= max_attempts:
                del self._records[email]
                return False, "exceeded"
            rec.attempts += 1
            if hmac.compare_digest(rec.otp, otp):
                del self._records[email]
                return True, "ok"
            if rec.attempts >= max_attempts:
                del self._records[email]
            return False, "invalid"


class OTPSender(ABC):
    """Delivery channel for OTP codes. Implementations: TerminalSender now,
    EmailSender/SMSSender later — the auth contract stays identical."""

    @abstractmethod
    def send(self, email: str, otp: str, expires_in_seconds: int) -> None:
        raise NotImplementedError


class TerminalSender(OTPSender):
    """Development-only delivery: prints a banner to the terminal."""

    def send(self, email: str, otp: str, expires_in_seconds: int) -> None:
        minutes = max(1, expires_in_seconds // 60)
        banner = (
            "========================================\n"
            "HOSTEL MANAGEMENT SYSTEM OTP\n"
            f"Email: {email}\n"
            f"OTP: {otp}\n"
            f"Expires: {minutes} minutes\n"
            "========================================"
        )
        # Logged at INFO to stdout; it is NOT returned to the caller via the API.
        logger.info(banner)


def generate_otp(length: int) -> str:
    """Generate a cryptographically-random numeric OTP of the given length."""
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


_otp_store = OTPStore()
_otp_sender: OTPSender = TerminalSender()


def get_otp_store() -> OTPStore:
    return _otp_store


def get_otp_sender() -> OTPSender:
    """Return the OTP delivery channel. Swap the implementation here later."""
    return _otp_sender
