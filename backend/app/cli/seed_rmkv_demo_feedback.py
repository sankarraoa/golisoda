"""Generate synthetic RMKV demo feedback (responses) for kiosk channels.

Uses the same survey versions as the live channels: exit NPS + section CSAT/gaps.
Last N calendar months (default 6): for each month, each channel gets 20–30 responses
with timestamps spread across the days of that month (current month capped at today).

Idempotent: stable idempotency keys (re-run skips existing rows).

Usage:
  goli-seed-rmkv-demo-feedback
  goli-seed-rmkv-demo-feedback --tenant-slug rmkv-sarees --months 6
"""

from __future__ import annotations

import argparse
import asyncio
import random
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session_factory
from app.models.channel import FeedbackChannel
from app.models.response import Response, ResponseAnswer
from app.models.survey import SurveyVersion
from app.models.tenant import Tenant
from app.services.feedback_submission import (
    hash_idempotency_key,
    serialize_answer_value,
    validate_public_answers,
)


def _month_window(anchor: date, months_before: int) -> tuple[date, date]:
    """Return inclusive [start, end] for a calendar month relative to anchor.

    months_before=0 → first day of anchor's month through anchor.
    months_before=1 → full previous calendar month, etc.
    """
    y, m = anchor.year, anchor.month
    for _ in range(months_before):
        if m == 1:
            y -= 1
            m = 12
        else:
            m -= 1
    start = date(y, m, 1)
    if months_before == 0:
        return start, anchor
    if m == 12:
        next_first = date(y + 1, 1, 1)
    else:
        next_first = date(y, m + 1, 1)
    end = next_first - timedelta(days=1)
    return start, end


def _random_submitted_at(rng: random.Random, day: date) -> datetime:
    h = rng.randint(10, 20)
    mi = rng.randint(0, 59)
    s = rng.randint(0, 59)
    return datetime(day.year, day.month, day.day, h, mi, s, tzinfo=UTC)


def _pick_days(rng: random.Random, start: date, end: date, n: int) -> list[date]:
    span = (end - start).days + 1
    return [start + timedelta(days=rng.randrange(span)) for _ in range(n)]


def _safe_validate(snapshot: dict, answers: list[dict[str, Any]]) -> list[dict]:
    try:
        return validate_public_answers(schema_snapshot=snapshot, submitted_answers=answers)
    except HTTPException as exc:
        detail = exc.detail
        msg = detail if isinstance(detail, str) else repr(detail)
        raise SystemExit(f"Validation failed: {msg}") from exc


def _exit_payload(rng: random.Random) -> list[dict[str, Any]]:
    # Slight positive skew
    weights = [1, 1, 1, 2, 2, 3, 4, 5, 6, 7, 8]
    nps = rng.choices(range(11), weights=weights, k=1)[0]
    return [{"question_key": "exit_nps", "value": nps}]


_SECTION_GAP_VALUES = (
    "variety",
    "price",
    "sizes_fit",
    "staff_help",
    "trial",
    "billing",
    "cleanliness",
)


def _section_payload(rng: random.Random) -> list[dict[str, Any]]:
    sat = rng.choices([1, 2, 3, 4, 5], weights=[1, 2, 4, 5, 4], k=1)[0]
    staff = rng.choices([1, 2], weights=[1, 4], k=1)[0]
    out: list[dict[str, Any]] = [
        {"question_key": "section_satisfaction", "value": sat},
        {"question_key": "staff_behavior", "value": staff},
    ]
    if rng.random() < 0.45:
        k = rng.randint(1, min(3, len(_SECTION_GAP_VALUES)))
        picked = rng.sample(list(_SECTION_GAP_VALUES), k=k)
        out.append({"question_key": "section_gaps", "value": picked})
    return out


async def _load_channels(session: AsyncSession, *, tenant_slug: str) -> list[FeedbackChannel]:
    rows = (
        await session.scalars(
            select(FeedbackChannel)
            .join(Tenant, FeedbackChannel.tenant_id == Tenant.id)
            .where(Tenant.slug == tenant_slug, FeedbackChannel.channel_code.startswith("rm-"))
            .order_by(FeedbackChannel.channel_code)
        )
    ).all()
    if not rows:
        raise SystemExit(
            f"No channels with code prefix 'rm-' for tenant slug={tenant_slug!r}. "
            "Run goli-seed-rmkv-sarees first."
        )
    return list(rows)


async def _schema_by_version_id(
    session: AsyncSession, version_ids: set[UUID]
) -> dict[UUID, dict]:
    out: dict[UUID, dict] = {}
    for vid in version_ids:
        ver = await session.get(SurveyVersion, vid)
        if ver is None or not ver.schema_snapshot:
            raise SystemExit(f"SurveyVersion {vid} missing or has no schema_snapshot.")
        out[vid] = ver.schema_snapshot
    return out


async def _run(
    *,
    tenant_slug: str,
    months: int,
    min_per_month: int,
    max_per_month: int,
    seed: int | None,
) -> None:
    rng = random.Random(seed)
    anchor = datetime.now(UTC).date()
    if min_per_month > max_per_month:
        raise SystemExit("--min-per-month cannot exceed --max-per-month.")

    async with get_session_factory()() as session:
        assert isinstance(session, AsyncSession)
        channels = await _load_channels(session, tenant_slug=tenant_slug)
        schemas = await _schema_by_version_id(
            session, {c.survey_version_id for c in channels}
        )

        created = 0
        skipped = 0

        for ch in channels:
            meta = ch.metadata_json or {}
            survey_kind = meta.get("survey")
            if survey_kind == "exit":
                build_answers = _exit_payload
            elif survey_kind == "section":
                build_answers = _section_payload
            else:
                raise SystemExit(
                    f"Channel {ch.channel_code!r} has unknown metadata survey={survey_kind!r}; "
                    "expected RMKV kiosk channels from goli-seed-rmkv-sarees."
                )
            snapshot = schemas[ch.survey_version_id]

            for months_before in range(months - 1, -1, -1):
                start, end = _month_window(anchor, months_before)
                n = rng.randint(min_per_month, max_per_month)
                days = _pick_days(rng, start, end, n)
                month_key = start.isoformat()

                for idx in range(n):
                    idem = f"seed-rmkv-demo-v1-{ch.channel_code}-{month_key}-{idx:04d}"
                    idem_hash = hash_idempotency_key(ch.channel_code, idem)
                    exists = await session.scalar(
                        select(Response.id).where(
                            Response.tenant_id == ch.tenant_id,
                            Response.channel_id == ch.id,
                            Response.idempotency_key_hash == idem_hash,
                        )
                    )
                    if exists is not None:
                        skipped += 1
                        continue

                    raw_answers = build_answers(rng)
                    validated = _safe_validate(snapshot, raw_answers)
                    submitted_at = _random_submitted_at(rng, days[idx])

                    response = Response(
                        tenant_id=ch.tenant_id,
                        channel_id=ch.id,
                        location_id=ch.location_id,
                        survey_version_id=ch.survey_version_id,
                        idempotency_key_hash=idem_hash,
                        locale="en",
                        submitted_at=submitted_at,
                        metadata_json={"source": "seed_rmkv_demo_feedback"},
                    )
                    session.add(response)
                    await session.flush()

                    for ans in validated:
                        session.add(
                            ResponseAnswer(
                                tenant_id=ch.tenant_id,
                                response_id=response.id,
                                question_key=ans["question_key"],
                                question_type=ans["question_type"],
                                raw_value=serialize_answer_value(ans["value"]),
                                value_json=ans["value"],
                                is_pii=ans["is_pii"],
                            )
                        )
                    created += 1

        await session.commit()

    print(f"Demo feedback: {created} responses created, {skipped} skipped (already present).")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--tenant-slug", default="rmkv-sarees", help="Tenant slug")
    p.add_argument("--months", type=int, default=6, help="Number of calendar months (default 6)")
    p.add_argument(
        "--min-per-month",
        type=int,
        default=20,
        help="Minimum responses per channel per month (default 20)",
    )
    p.add_argument(
        "--max-per-month",
        type=int,
        default=30,
        help="Maximum responses per channel per month (default 30)",
    )
    p.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed for reproducible data (optional)",
    )
    args = p.parse_args()
    asyncio.run(
        _run(
            tenant_slug=args.tenant_slug,
            months=args.months,
            min_per_month=args.min_per_month,
            max_per_month=args.max_per_month,
            seed=args.seed,
        )
    )


if __name__ == "__main__":
    main()
