"""Seed RMKV Sarees demo: 6 locations, 2 published surveys, 24 kiosk channels.

Idempotent: safe to re-run; skips entities that already exist (by slug / code / channel_code).

Usage:
  goli-seed-rmkv-sarees
  goli-seed-rmkv-sarees --tenant-slug rmkv-sarees
  goli-seed-rmkv-sarees --create-tenant   # create tenant if missing
"""

from __future__ import annotations

import argparse
import asyncio
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.tenants import get_branding_or_create
from app.core.database import get_session_factory
from app.models.auth import User
from app.models.channel import FeedbackChannel
from app.models.enums import ChannelStatus, ChannelType, QuestionType, SurveyStatus, TenantStatus
from app.models.survey import Question, QuestionOption, Survey, SurveyVersion
from app.models.survey_template import SurveyTemplate
from app.models.tenant import Location, Tenant
from app.services.surveys import publish_survey_version

# (display name, location code, city, region, address / floor notes)
LOCATION_SEEDS: tuple[tuple[str, str, str, str, str], ...] = (
    (
        "Usman Road, T. Nagar",
        "rm-tnagar",
        "Chennai",
        "Tamil Nadu",
        "Standalone flagship · Usman Road, T. Nagar, Chennai. Floor not specified.",
    ),
    (
        "Phoenix Market City",
        "rm-phoenix-vl",
        "Chennai",
        "Tamil Nadu",
        "Velachery, Chennai · 2nd floor · multi-unit space (S 55–58).",
    ),
    (
        "Nexus Vijaya Mall (Forum Vijaya)",
        "rm-vijaya",
        "Chennai",
        "Tamil Nadu",
        "Vadapalani, Chennai · ground floor · units 16, 116 & 215.",
    ),
    (
        "Tirunelveli Town & Vannarpettai",
        "rm-tirunelveli",
        "Tirunelveli",
        "Tamil Nadu",
        "Street-level stores · Town & Vannarpettai. No floor detail.",
    ),
    (
        "Brookefields Mall",
        "rm-brookefields",
        "Coimbatore",
        "Tamil Nadu",
        "Brookefields Mall, Coimbatore · mall store · floor not specified.",
    ),
    (
        "Orion Mall",
        "rm-orion",
        "Bengaluru",
        "Karnataka",
        "Orion Mall, Bengaluru · 1st floor · single-floor store.",
    ),
)

EXIT_SURVEY_SLUG = "rm-exit-nps"
EXIT_SURVEY_TITLE = "RMKV — Exit experience"
SECTION_SURVEY_SLUG = "rm-section-feedback"
SECTION_SURVEY_TITLE = "RMKV — Section feedback"


SECTIONS: tuple[tuple[str, str], ...] = (
    ("Sarees", "sar"),
    ("Mens", "men"),
    ("Kids", "kid"),
)


def _section_gaps_options() -> list[tuple[str, str]]:
    return [
        ("variety", "Product variety / range"),
        ("price", "Pricing / value for money"),
        ("sizes_fit", "Sizes & fit availability"),
        ("staff_help", "Staff availability & help"),
        ("trial", "Trial / changing room experience"),
        ("billing", "Billing / queue time"),
        ("cleanliness", "Cleanliness & comfort"),
    ]


async def _require_publisher_id(session: AsyncSession) -> UUID:
    pid = await session.scalar(select(User.id).where(User.tenant_id.is_(None)).limit(1))
    if pid is not None:
        return pid
    pid = await session.scalar(select(User.id).limit(1))
    if pid is not None:
        return pid
    raise SystemExit(
        "seed_rmkv_sarees needs at least one user row to record publish audit. "
        "Run goli-bootstrap-platform-admin or create a user, then retry."
    )


async def _get_kiosk_template_id(session: AsyncSession) -> UUID:
    tid = await session.scalar(
        select(SurveyTemplate.id).where(SurveyTemplate.slug == "kiosk_touch"),
    )
    if tid is None:
        raise SystemExit("survey_templates.slug=kiosk_touch missing; run migrations.")
    return tid


async def _ensure_tenant(session: AsyncSession, *, slug: str, create: bool) -> Tenant:
    tenant = await session.scalar(select(Tenant).where(Tenant.slug == slug))
    if tenant is not None:
        return tenant
    if not create:
        raise SystemExit(
            f"Tenant slug={slug!r} not found. Create the tenant in the admin UI first, "
            "or pass --create-tenant to create it from this script."
        )
        tenant = Tenant(
            name="RMKV Sarees",
            slug=slug,
            status=TenantStatus.ACTIVE,
            default_locale="en",
            address_city="Chennai",
            address_state="Tamil Nadu",
            address_line1="Retail network — TN & Karnataka",
        )
        session.add(tenant)
        await session.flush()
        print(f"Created tenant {tenant.name!r} slug={tenant.slug!r}")
        return tenant


async def _ensure_locations(session: AsyncSession, tenant_id: UUID) -> dict[str, Location]:
    by_code: dict[str, Location] = {}
    for name, code, city, region, address in LOCATION_SEEDS:
        existing = await session.scalar(
            select(Location).where(Location.tenant_id == tenant_id, Location.code == code)
        )
        if existing is not None:
            by_code[code] = existing
            continue
        loc = Location(
            tenant_id=tenant_id,
            name=name,
            code=code,
            city=city,
            region=region,
            address=address,
            is_active=True,
        )
        session.add(loc)
        await session.flush()
        by_code[code] = loc
        print(f"  + location {code}: {name}")
    return by_code


async def _ensure_exit_survey(
    session: AsyncSession,
    tenant_id: UUID,
    publisher_id: UUID,
) -> SurveyVersion:
    survey = await session.scalar(
        select(Survey).where(Survey.tenant_id == tenant_id, Survey.slug == EXIT_SURVEY_SLUG)
    )
    if survey is None:
        survey = Survey(
            tenant_id=tenant_id,
            created_by_user_id=publisher_id,
            title=EXIT_SURVEY_TITLE,
            slug=EXIT_SURVEY_SLUG,
            description="Single NPS collected at store exit (all locations).",
            default_locale="en",
            status=SurveyStatus.DRAFT,
        )
        session.add(survey)
        await session.flush()
        session.add(
            Question(
                tenant_id=tenant_id,
                survey_id=survey.id,
                question_key="exit_nps",
                question_type=QuestionType.NPS,
                prompt=("How likely are you to recommend RMKV Sarees to a friend or colleague?"),
                help_text=None,
                is_required=True,
                is_pii=False,
                sort_order=0,
            )
        )
        await session.flush()
        print(f"  + survey {EXIT_SURVEY_SLUG}")

    version = await session.scalar(
        select(SurveyVersion)
        .where(SurveyVersion.survey_id == survey.id)
        .order_by(SurveyVersion.version_number.desc())
        .limit(1)
    )
    if version is None:
        version = await publish_survey_version(
            session,
            survey=survey,
            published_by_user_id=publisher_id,
        )
        await session.flush()
        print(f"  · published {EXIT_SURVEY_SLUG} v{version.version_number}")
    return version


async def _ensure_section_survey(
    session: AsyncSession,
    tenant_id: UUID,
    publisher_id: UUID,
) -> SurveyVersion:
    survey = await session.scalar(
        select(Survey).where(Survey.tenant_id == tenant_id, Survey.slug == SECTION_SURVEY_SLUG)
    )
    if survey is None:
        survey = Survey(
            tenant_id=tenant_id,
            created_by_user_id=publisher_id,
            title=SECTION_SURVEY_TITLE,
            slug=SECTION_SURVEY_SLUG,
            description="Section kiosks — sarees / mens / kids (all locations).",
            default_locale="en",
            status=SurveyStatus.DRAFT,
        )
        session.add(survey)
        await session.flush()

        q1 = Question(
            tenant_id=tenant_id,
            survey_id=survey.id,
            question_key="section_satisfaction",
            question_type=QuestionType.CSAT_5,
            prompt="Overall, how satisfied are you with this section today?",
            help_text=None,
            is_required=True,
            is_pii=False,
            sort_order=0,
        )
        session.add(q1)
        await session.flush()

        q2 = Question(
            tenant_id=tenant_id,
            survey_id=survey.id,
            question_key="section_gaps",
            question_type=QuestionType.MULTI_SELECTION,
            prompt="What felt missing or could be better? (Select all that apply)",
            help_text=None,
            is_required=False,
            is_pii=False,
            sort_order=1,
        )
        session.add(q2)
        await session.flush()
        for so, (val, lbl) in enumerate(_section_gaps_options()):
            session.add(
                QuestionOption(
                    tenant_id=tenant_id,
                    question_id=q2.id,
                    value=val,
                    label=lbl,
                    sort_order=so,
                )
            )
        await session.flush()

        session.add(
            Question(
                tenant_id=tenant_id,
                survey_id=survey.id,
                question_key="staff_behavior",
                question_type=QuestionType.CSAT_2,
                prompt="Were our staff courteous and helpful?",
                help_text=None,
                is_required=True,
                is_pii=False,
                sort_order=2,
            )
        )
        await session.flush()
        print(f"  + survey {SECTION_SURVEY_SLUG}")

    version = await session.scalar(
        select(SurveyVersion)
        .where(SurveyVersion.survey_id == survey.id)
        .order_by(SurveyVersion.version_number.desc())
        .limit(1)
    )
    if version is None:
        version = await publish_survey_version(
            session,
            survey=survey,
            published_by_user_id=publisher_id,
        )
        await session.flush()
        print(f"  · published {SECTION_SURVEY_SLUG} v{version.version_number}")
    return version


async def _ensure_channel(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    location: Location,
    template_id: UUID,
    survey_version_id: UUID,
    channel_code: str,
    name: str,
    meta: dict[str, Any],
) -> None:
    existing = await session.scalar(
        select(FeedbackChannel.id).where(FeedbackChannel.channel_code == channel_code)
    )
    if existing is not None:
        return
    session.add(
        FeedbackChannel(
            tenant_id=tenant_id,
            location_id=location.id,
            survey_version_id=survey_version_id,
            survey_template_id=template_id,
            name=name,
            channel_code=channel_code,
            channel_type=ChannelType.KIOSK,
            status=ChannelStatus.ACTIVE,
            qr_url=None,
            metadata_json=meta,
        )
    )
    await session.flush()
    print(f"  + channel {channel_code}: {name}")


async def _run(*, tenant_slug: str, create_tenant: bool) -> None:
    async with get_session_factory()() as session:
        assert isinstance(session, AsyncSession)
        tenant = await _ensure_tenant(session, slug=tenant_slug, create=create_tenant)
        await get_branding_or_create(session, tenant.id)

        print("Locations…")
        locs = await _ensure_locations(session, tenant.id)

        template_id = await _get_kiosk_template_id(session)
        publisher_id = await _require_publisher_id(session)

        print("Surveys…")
        exit_ver = await _ensure_exit_survey(session, tenant.id, publisher_id)
        section_ver = await _ensure_section_survey(session, tenant.id, publisher_id)

        print("Channels (exit)…")
        for _name, code, _city, _region, notes in LOCATION_SEEDS:
            loc = locs[code]
            ch_code = f"rm-exit-{code.replace('rm-', '')}"
            await _ensure_channel(
                session,
                tenant_id=tenant.id,
                location=loc,
                template_id=template_id,
                survey_version_id=exit_ver.id,
                channel_code=ch_code[:32],
                name=f"Exit — {loc.name}",
                meta={"survey": "exit", "floor_notes": notes},
            )

        print("Channels (section)…")
        for _name, code, _city, _region, notes in LOCATION_SEEDS:
            loc = locs[code]
            for section_label, section_abbr in SECTIONS:
                short = code.replace("rm-", "")
                ch_code = f"rm-{section_abbr}-{short}"
                await _ensure_channel(
                    session,
                    tenant_id=tenant.id,
                    location=loc,
                    template_id=template_id,
                    survey_version_id=section_ver.id,
                    channel_code=ch_code[:32],
                    name=f"{section_label} — {loc.name}",
                    meta={
                        "survey": "section",
                        "section": section_label.lower(),
                        "floor_notes": notes,
                    },
                )

        await session.commit()
    print("Done.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tenant-slug",
        default="rmkv-sarees",
        help="Tenant slug (default: rmkv-sarees)",
    )
    parser.add_argument(
        "--create-tenant",
        action="store_true",
        help="Create RMKV tenant + branding if the slug does not exist.",
    )
    args = parser.parse_args()
    asyncio.run(_run(tenant_slug=args.tenant_slug, create_tenant=args.create_tenant))


if __name__ == "__main__":
    main()
