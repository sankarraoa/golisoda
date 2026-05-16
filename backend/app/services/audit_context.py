from __future__ import annotations

import json
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.principal import Principal, load_principal
from app.models.auth import Permission, Role, RolePermission, User, UserRoleBinding
from app.models.survey import Question, QuestionOption
from app.models.tenant import Location, Tenant, TenantBranding


async def audit_actor_from_principal(session: AsyncSession, principal: Principal) -> dict:
    user = await session.get(User, principal.user_id)
    display_name = user.display_name if user is not None else principal.email
    return {
        "user_id": str(principal.user_id),
        "email": principal.email,
        "display_name": display_name,
        "role_codes": list(principal.role_codes),
    }


async def audit_actor_from_user(session: AsyncSession, user: User) -> dict:
    principal = await load_principal(session, user)
    return {
        "user_id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "role_codes": list(principal.role_codes),
    }


def anonymous_actor(*, email: str | None = None) -> dict:
    return {
        "user_id": None,
        "email": email,
        "display_name": None,
        "role_codes": [],
    }


def system_actor(label: str) -> dict:
    return {
        "user_id": None,
        "email": None,
        "display_name": None,
        "role_codes": [],
        "system": label,
    }


def audit_metadata(
    *,
    actor: dict,
    before: dict | None = None,
    after: dict | None = None,
    payload_level: str | None = None,
    **extra: object,
) -> dict:
    meta: dict = {"actor": actor, **extra}
    if before is not None:
        meta["before"] = before
    if after is not None:
        meta["after"] = after
    if payload_level is not None:
        meta["payload_level"] = payload_level
    return meta


def tenant_audit_snapshot(tenant: Tenant) -> dict:
    return {
        "name": tenant.name,
        "slug": tenant.slug,
        "default_locale": tenant.default_locale,
        "status": tenant.status.value,
        "address_line1": tenant.address_line1,
        "address_line2": tenant.address_line2,
        "address_city": tenant.address_city,
        "address_state": tenant.address_state,
        "address_postal_code": tenant.address_postal_code,
    }


def location_audit_snapshot(location: Location) -> dict:
    return {
        "name": location.name,
        "code": location.code,
        "city": location.city,
        "region": location.region,
        "address": location.address,
        "is_active": location.is_active,
    }


def branding_audit_snapshot(branding: TenantBranding, *, redact_theme: bool) -> dict:
    snap: dict = {
        "logo_url": branding.logo_url,
        "primary_color": branding.primary_color,
        "secondary_color": branding.secondary_color,
        "thank_you_text": (branding.thank_you_text or "")[:2000],
    }
    snap["theme_overrides"] = "[omitted]" if redact_theme else (branding.theme_overrides or {})
    return snap


def survey_audit_snapshot(survey: object) -> dict:
    return {
        "title": survey.title,
        "slug": survey.slug,
        "description": (survey.description or "")[:2000],
        "default_locale": survey.default_locale,
        "status": survey.status.value,
    }


def _trim_branching_metadata(branching_metadata: object) -> object:
    if branching_metadata is None:
        return None
    if isinstance(branching_metadata, dict) and len(json.dumps(branching_metadata, default=str)) > 4000:
        return "[omitted]"
    return branching_metadata


async def question_audit_snapshot(session: AsyncSession, question: Question) -> dict:
    options = (
        await session.scalars(
            select(QuestionOption)
            .where(QuestionOption.question_id == question.id)
            .order_by(QuestionOption.sort_order, QuestionOption.created_at)
        )
    ).all()
    return {
        "question_key": question.question_key,
        "question_type": question.question_type.value,
        "prompt": (question.prompt or "")[:2000],
        "help_text": (question.help_text or "")[:1000] if question.help_text else None,
        "is_required": question.is_required,
        "is_pii": question.is_pii,
        "sort_order": question.sort_order,
        "branching_metadata": _trim_branching_metadata(question.branching_metadata),
        "options": [
            {"value": o.value, "label": (o.label or "")[:500], "sort_order": o.sort_order}
            for o in options
        ],
    }


async def role_definition_snapshot(session: AsyncSession, role: Role) -> dict:
    codes = (
        await session.scalars(
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == role.id)
            .order_by(Permission.code)
        )
    ).all()
    return {
        "code": role.code,
        "name": role.name,
        "description": (role.description or "")[:500] if role.description else None,
        "permission_codes": [c.value for c in codes],
    }


async def user_bindings_snapshot(session: AsyncSession, user_id: UUID) -> list[dict]:
    rows = await session.execute(
        select(Role.code, UserRoleBinding.scope, UserRoleBinding.location_id)
        .join(Role, Role.id == UserRoleBinding.role_id)
        .where(UserRoleBinding.user_id == user_id)
        .order_by(Role.code)
    )
    return [
        {
            "role_code": code,
            "scope": scope.value,
            "location_id": str(loc) if loc else None,
        }
        for code, scope, loc in rows
    ]


def channel_audit_metadata_snapshot(metadata_json: dict | None) -> object:
    if not metadata_json:
        return metadata_json
    if len(json.dumps(metadata_json, default=str)) > 2000:
        return "[omitted]"
    return metadata_json


def channel_audit_snapshot(channel: object) -> dict:
    return {
        "name": channel.name,
        "channel_type": channel.channel_type.value,
        "status": channel.status.value,
        "location_id": str(channel.location_id),
        "survey_version_id": str(channel.survey_version_id),
        "survey_template_id": str(channel.survey_template_id),
        "metadata": channel_audit_metadata_snapshot(channel.metadata_json),
    }


def user_profile_audit_snapshot(user: User) -> dict:
    return {
        "email": user.email,
        "display_name": user.display_name,
        "status": user.status.value,
    }
