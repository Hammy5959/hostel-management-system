"""Tests for the pure state-machine transition tables."""

from __future__ import annotations

from app.complaints.service import _ALLOWED_TRANSITIONS as COMPLAINT_TRANSITIONS


def test_complaint_valid_flow():
    assert "assigned" in COMPLAINT_TRANSITIONS["open"]
    assert "in_progress" in COMPLAINT_TRANSITIONS["assigned"]
    assert "resolved" in COMPLAINT_TRANSITIONS["in_progress"]
    assert "closed" in COMPLAINT_TRANSITIONS["resolved"]


def test_complaint_no_illegal_skips():
    # Cannot jump from open to resolved/closed.
    assert "resolved" not in COMPLAINT_TRANSITIONS["open"]
    assert "closed" not in COMPLAINT_TRANSITIONS["open"]
    # Terminal states cannot move.
    assert COMPLAINT_TRANSITIONS["closed"] == set()
    assert COMPLAINT_TRANSITIONS["cancelled"] == set()
