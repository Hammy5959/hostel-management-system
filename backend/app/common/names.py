"""Shared name formatting for human-readable audit descriptions."""

from __future__ import annotations


def full_name(first_name: str, last_name: str | None) -> str:
    return f"{first_name} {last_name}" if last_name else first_name
