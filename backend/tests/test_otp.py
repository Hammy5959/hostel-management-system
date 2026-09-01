"""Unit tests for the OTP store and generator (no database involved)."""

from __future__ import annotations

from app.auth.otp import OTPStore, generate_otp


def test_generate_otp_length_and_digits():
    otp = generate_otp(6)
    assert len(otp) == 6
    assert otp.isdigit()
    # Values should be random across calls.
    assert generate_otp(6) != generate_otp(6)


def test_valid_otp_consumes_record():
    store = OTPStore()
    store.set("a@example.com", "123456", ttl_seconds=60)
    ok, reason = store.consume_attempt("a@example.com", "123456", max_attempts=3)
    assert ok is True
    assert reason == "ok"
    # Consumed — a second use must fail.
    ok, reason = store.consume_attempt("a@example.com", "123456", max_attempts=3)
    assert ok is False
    assert reason == "not_found"


def test_invalid_otp_increments_attempts():
    store = OTPStore()
    store.set("a@example.com", "123456", ttl_seconds=60)
    ok, reason = store.consume_attempt("a@example.com", "999999", max_attempts=3)
    assert ok is False
    assert reason == "invalid"
    # Correct OTP still works until attempts are exhausted.
    ok, _ = store.consume_attempt("a@example.com", "123456", max_attempts=3)
    assert ok is True


def test_attempt_limit_exhausts_record():
    store = OTPStore()
    store.set("a@example.com", "123456", ttl_seconds=60)
    for _ in range(3):
        store.consume_attempt("a@example.com", "000000", max_attempts=3)
    ok, reason = store.consume_attempt("a@example.com", "123456", max_attempts=3)
    assert ok is False
    assert reason == "not_found"


def test_expired_otp_rejected():
    store = OTPStore()
    store.set("a@example.com", "123456", ttl_seconds=-1)  # already expired
    ok, reason = store.consume_attempt("a@example.com", "123456", max_attempts=3)
    assert ok is False
    assert reason == "expired"


def test_unknown_email():
    store = OTPStore()
    ok, reason = store.consume_attempt("nobody@example.com", "123456", max_attempts=3)
    assert ok is False
    assert reason == "not_found"
