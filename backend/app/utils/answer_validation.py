"""Normalize and validate free-text answers for feedback submission."""

from __future__ import annotations

import re

from email_validator import EmailNotValidError, validate_email

SHORT_TEXT_MAX_LEN = 2048


def validated_short_text(value: str) -> str | None:
    raw = "" if value is None else value
    text = raw.strip()
    if len(text) > SHORT_TEXT_MAX_LEN:
        return None
    return text


_phone_allowed = re.compile(r"^[\d+.\-()]+$")


def validated_phone_normalized(value: str) -> str | None:
    """Return canonical phone string (+digits when international) or \"\" for blank. None = invalid."""
    raw = "" if value is None else value
    s = raw.strip()
    if not s:
        return ""

    stripped = "".join(s.split())
    if not _phone_allowed.fullmatch(stripped):
        return None

    digits = "".join(ch for ch in stripped if ch.isdigit())
    if len(digits) < 8 or len(digits) > 15:
        return None

    if stripped.startswith("+"):
        return f"+{digits}"
    return digits


def validated_email_normalized(value: str) -> str | None:
    raw = "" if value is None else value
    s = raw.strip()
    if not s:
        return ""
    try:
        return validate_email(s, check_deliverability=False).normalized
    except EmailNotValidError:
        return None
