"""Platform (super admin) API: manage platform operators and tenant onboarding."""

import re
import secrets
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.audit_logs import serialize_audit_log_rows
from app.api.audit_schemas import AuditLogEntry
from app.api.platform_schemas import (
    PlatformTenantAddressPatchRequest,
    PlatformTenantCreateRequest,
    PlatformTenantListEntry,
    PlatformTenantPatchRequest,
    SuperAdminUserCreateRequest,
    SuperAdminUserPatchRequest,
    SuperAdminUserResponse,
)
from app.api.survey_template_schemas import SurveyTemplateResponse
from app.api.tenant_schemas import TenantResponse
from app.api.tenants import (
    ensure_permissions_and_default_roles,
    get_branding_or_create,
    get_tenant_role_or_404,
)
from app.auth.authorization import require_permission
from app.auth.dependencies import get_current_principal
from app.auth.passwords import hash_password
from app.auth.principal import Principal
from app.core.config import get_settings
from app.core.database import get_session
from app.models.auth import Role, User, UserRoleBinding
from app.models.channel import FeedbackChannel
from app.models.enums import (
    AuditAction,
    AuditActorType,
    AuditOutcome,
    BindingScope,
    PermissionCode,
    TenantStatus,
    UserStatus,
)
from app.models.survey_template import SurveyTemplate
from app.models.tenant import Tenant
from app.schemas.survey_presentation import parse_presentation
from app.services.audit import write_audit_log
from app.services.audit_list import list_platform_audit_logs
from app.services.audit_context import (
    audit_actor_from_principal,
    audit_metadata,
    tenant_audit_snapshot,
    user_profile_audit_snapshot,
)
from app.services.template_pack import build_export_zip, import_template_pack, remove_template_pack_dir

router = APIRouter(prefix="/platform", tags=["platform"])

PLATFORM_SUPER_ADMIN_INITIAL_PASSWORD = "test1234"
TENANT_ADMIN_INITIAL_PASSWORD = "test1234"


def _optional_address_line(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped if stripped else None


def _optional_trimmed(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped if stripped else None


_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$")

_PLATFORM_TENANT_PROFILE_FIELDS = frozenset(
    {
        "name",
        "slug",
        "default_locale",
        "address_line1",
        "address_line2",
        "address_city",
        "address_state",
        "address_postal_code",
    }
)


async def _tenant_slug_in_use(session: AsyncSession, slug: str, exclude_tenant_id: UUID) -> bool:
    existing = await session.scalar(
        select(Tenant.id).where(Tenant.slug == slug, Tenant.id != exclude_tenant_id)
    )
    return existing is not None


def _slug_base_from_name(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower().strip()).strip("-")
    if not base:
        base = "tenant"
    if len(base) > 78:
        base = base[:78].rstrip("-")
    if len(base) < 3:
        base = f"{base}-org" if base else "tenant"
        base = base[:80].rstrip("-")
    if len(base) < 3:
        base = "tenant"
    return base


async def _allocate_unique_tenant_slug(session: AsyncSession, name: str) -> str:
    base = _slug_base_from_name(name)
    for n in range(0, 400):
        if n == 0:
            candidate = base
        else:
            suffix = f"-{n}"
            max_base = 80 - len(suffix)
            stem = base[:max_base] if max_base >= 1 else base[:1]
            candidate = f"{stem}{suffix}"[:80]
        if not _SLUG_RE.fullmatch(candidate):
            candidate = f"t-{secrets.token_hex(6)}"
        exists = await session.scalar(select(Tenant.id).where(Tenant.slug == candidate))
        if exists is None:
            return candidate
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not allocate a unique tenant slug.",
    )


async def _map_primary_tenant_admin_users(
    session: AsyncSession, tenant_ids: list[UUID]
) -> dict[UUID, User]:
    """Prefer earliest tenant_admin binding; fallback to earliest tenant user (onboarding admin)."""
    if not tenant_ids:
        return {}
    chosen: dict[UUID, User] = {}
    stmt = (
        select(User)
        .join(UserRoleBinding, UserRoleBinding.user_id == User.id)
        .join(Role, Role.id == UserRoleBinding.role_id)
        .where(
            User.tenant_id.in_(tenant_ids),
            Role.code == "tenant_admin",
            Role.tenant_id.is_(None) | (Role.tenant_id == User.tenant_id),
        )
        .order_by(User.tenant_id, User.created_at.asc())
    )
    rows = (await session.scalars(stmt)).all()
    for user in rows:
        tid = user.tenant_id
        if tid is not None and tid not in chosen:
            chosen[tid] = user

    missing = [tid for tid in tenant_ids if tid not in chosen]
    if missing:
        stmt_fb = (
            select(User)
            .where(User.tenant_id.in_(missing))
            .order_by(User.tenant_id, User.created_at.asc())
        )
        for user in (await session.scalars(stmt_fb)).all():
            tid = user.tenant_id
            if tid is not None and tid not in chosen:
                chosen[tid] = user
    return chosen


def _platform_list_row(tenant: Tenant, admin: User | None) -> PlatformTenantListEntry:
    """Build list row with administrator fields (explicit merge avoids serialization quirks)."""
    base = TenantResponse.model_validate(tenant, from_attributes=True)
    dumped = base.model_dump()
    return PlatformTenantListEntry(
        **dumped,
        administrator_email=admin.email if admin else None,
        administrator_display_name=admin.display_name if admin else None,
    )


def _require_platform_operator(principal: Principal) -> None:
    if principal.tenant_id is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform credentials required.",
        )
    if PermissionCode.PLATFORM_MANAGE.value not in principal.permission_codes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing platform permission.",
        )


@router.get("/super-admin-users", response_model=list[SuperAdminUserResponse])
async def list_super_admin_users(
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: Annotated[Principal, Depends(get_current_principal)],
) -> list[SuperAdminUserResponse]:
    await ensure_permissions_and_default_roles(session)
    _require_platform_operator(principal)

    users = await session.scalars(
        select(User).where(User.tenant_id.is_(None)).order_by(User.created_at.asc())
    )
    return [
        SuperAdminUserResponse(
            id=u.id,
            email=u.email,
            display_name=u.display_name,
            status=u.status,
            created_at=u.created_at,
            updated_at=u.updated_at,
        )
        for u in users
    ]


@router.get("/survey-templates", response_model=list[SurveyTemplateResponse])
async def list_platform_survey_templates(
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: Annotated[Principal, Depends(get_current_principal)],
) -> list[SurveyTemplateResponse]:
    await ensure_permissions_and_default_roles(session)
    _require_platform_operator(principal)

    rows = (
        await session.scalars(
            select(SurveyTemplate).order_by(SurveyTemplate.sort_order.asc(), SurveyTemplate.slug.asc())
        )
    ).all()
    return [
        SurveyTemplateResponse(
            id=row.id,
            slug=row.slug,
            name=row.name,
            description=row.description,
            deployment_notes=row.deployment_notes,
            presentation=parse_presentation(row.presentation),
            sort_order=row.sort_order,
            is_active=row.is_active,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


def _template_row_to_response(row: SurveyTemplate) -> SurveyTemplateResponse:
    return SurveyTemplateResponse(
        id=row.id,
        slug=row.slug,
        name=row.name,
        description=row.description,
        deployment_notes=row.deployment_notes,
        presentation=parse_presentation(row.presentation),
        sort_order=row.sort_order,
        is_active=row.is_active,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get("/survey-templates/{template_id}/export")
async def export_platform_survey_template_pack(
    template_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: Annotated[Principal, Depends(get_current_principal)],
) -> Response:
    await ensure_permissions_and_default_roles(session)
    _require_platform_operator(principal)

    row = await session.get(SurveyTemplate, template_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey template not found.")

    settings = get_settings()
    zip_bytes = build_export_zip(settings, row)
    filename = f"template-{row.slug}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/survey-templates/import",
    response_model=SurveyTemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def import_platform_survey_template_pack(
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: Annotated[Principal, Depends(get_current_principal)],
    request: Request,
    file: Annotated[UploadFile, File(description="ZIP with template.json and optional assets/")],
) -> SurveyTemplateResponse:
    await ensure_permissions_and_default_roles(session)
    _require_platform_operator(principal)

    settings = get_settings()
    try:
        tpl = await import_template_pack(settings, session, file)
        actor = await audit_actor_from_principal(session, principal)
        await write_audit_log(
            session,
            actor_type=AuditActorType.USER,
            actor_id=str(principal.user_id),
            tenant_id=None,
            action=AuditAction.PLATFORM_TEMPLATE_IMPORTED,
            outcome=AuditOutcome.SUCCESS,
            resource_type="survey_template",
            resource_id=str(tpl.id),
            request_id=getattr(request.state, "request_id", None),
            metadata=audit_metadata(
                actor=actor,
                payload_level="action_only",
                slug=tpl.slug,
                name=tpl.name,
            ),
        )
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    await session.refresh(tpl)
    return _template_row_to_response(tpl)


@router.delete("/survey-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_platform_survey_template(
    template_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: Annotated[Principal, Depends(get_current_principal)],
    request: Request,
) -> None:
    await ensure_permissions_and_default_roles(session)
    _require_platform_operator(principal)

    row = await session.get(SurveyTemplate, template_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey template not found.")

    channel_n = await session.scalar(
        select(func.count()).select_from(FeedbackChannel).where(FeedbackChannel.survey_template_id == template_id)
    )
    channel_n = int(channel_n or 0)
    if channel_n > 0:
        tenant_n = await session.scalar(
            select(func.count(func.distinct(FeedbackChannel.tenant_id))).where(
                FeedbackChannel.survey_template_id == template_id
            )
        )
        tenant_n = int(tenant_n or 0)
        c_word = "channel" if channel_n == 1 else "channels"
        t_word = "tenant" if tenant_n == 1 else "tenants"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This template cannot be deleted: {channel_n} {c_word} "
                f"across {tenant_n} {t_word} still use it. "
                "Reassign those channels to another template first."
            ),
        )

    settings = get_settings()
    try:
        actor = await audit_actor_from_principal(session, principal)
        await write_audit_log(
            session,
            actor_type=AuditActorType.USER,
            actor_id=str(principal.user_id),
            tenant_id=None,
            action=AuditAction.PLATFORM_TEMPLATE_DELETED,
            outcome=AuditOutcome.SUCCESS,
            resource_type="survey_template",
            resource_id=str(row.id),
            request_id=getattr(request.state, "request_id", None),
            metadata=audit_metadata(
                actor=actor,
                payload_level="action_only",
                slug=row.slug,
                name=row.name,
            ),
        )
        await session.delete(row)
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    remove_template_pack_dir(settings, template_id)


@router.post(
    "/super-admin-users",
    response_model=SuperAdminUserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_super_admin_user(
    payload: SuperAdminUserCreateRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: Annotated[Principal, Depends(get_current_principal)],
    request: Request,
) -> SuperAdminUserResponse:
    await ensure_permissions_and_default_roles(session)
    _require_platform_operator(principal)

    normalized_email = str(payload.email).lower()
    existing_platform = await session.scalar(
        select(User).where(User.email == normalized_email, User.tenant_id.is_(None))
    )
    if existing_platform is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already registered.",
        )

    role = await session.scalar(
        select(Role).where(Role.code == "platform_super_admin", Role.tenant_id.is_(None))
    )
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Platform role is not provisioned. Run migrations and try again.",
        )

    display_name = f"{payload.first_name.strip()} {payload.last_name.strip()}".strip()
    user = User(
        tenant_id=None,
        email=normalized_email,
        display_name=display_name,
        password_hash=hash_password(PLATFORM_SUPER_ADMIN_INITIAL_PASSWORD),
        status=UserStatus.ACTIVE,
        token_version=1,
    )
    session.add(user)
    await session.flush()
    session.add(
        UserRoleBinding(
            user_id=user.id,
            role_id=role.id,
            scope=BindingScope.GLOBAL,
            tenant_id=None,
            location_id=None,
        )
    )
    await write_audit_log(
        session,
        actor_type=AuditActorType.USER,
        actor_id=str(principal.user_id),
        tenant_id=None,
        action=AuditAction.USER_CREATED,
        outcome=AuditOutcome.SUCCESS,
        resource_type="platform_user",
        resource_id=str(user.id),
        request_id=getattr(request.state, "request_id", None),
        metadata=audit_metadata(
            actor=await audit_actor_from_principal(session, principal),
            after=user_profile_audit_snapshot(user),
        ),
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not create platform user.",
        ) from exc

    await session.refresh(user)
    return SuperAdminUserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        status=user.status,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.patch(
    "/super-admin-users/{user_id}",
    response_model=SuperAdminUserResponse,
)
async def patch_super_admin_user(
    user_id: UUID,
    payload: SuperAdminUserPatchRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: Annotated[Principal, Depends(get_current_principal)],
    request: Request,
) -> SuperAdminUserResponse:
    await ensure_permissions_and_default_roles(session)
    _require_platform_operator(principal)

    user = await session.scalar(
        select(User).where(User.id == user_id, User.tenant_id.is_(None))
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Platform user not found.",
        )

    if payload.status == UserStatus.DISABLED and user_id == principal.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot deactivate your own account.",
        )

    if user.status != payload.status:
        before = user_profile_audit_snapshot(user)
        user.status = payload.status
        user.token_version += 1
        await write_audit_log(
            session,
            actor_type=AuditActorType.USER,
            actor_id=str(principal.user_id),
            tenant_id=None,
            action=AuditAction.PLATFORM_USER_UPDATED,
            outcome=AuditOutcome.SUCCESS,
            resource_type="platform_user",
            resource_id=str(user.id),
            request_id=getattr(request.state, "request_id", None),
            metadata=audit_metadata(
                actor=await audit_actor_from_principal(session, principal),
                before=before,
                after=user_profile_audit_snapshot(user),
            ),
        )
        try:
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Could not update platform user.",
            ) from exc
        await session.refresh(user)

    return SuperAdminUserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        status=user.status,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.get("/tenants", response_model=list[PlatformTenantListEntry])
async def list_all_tenants(
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: Annotated[Principal, Depends(get_current_principal)],
) -> list[PlatformTenantListEntry]:
    await ensure_permissions_and_default_roles(session)
    _require_platform_operator(principal)

    tenants = list(await session.scalars(select(Tenant).order_by(Tenant.name, Tenant.slug)))
    admin_by_tenant = await _map_primary_tenant_admin_users(session, [t.id for t in tenants])

    rows: list[PlatformTenantListEntry] = []
    for tenant in tenants:
        admin = admin_by_tenant.get(tenant.id)
        rows.append(_platform_list_row(tenant, admin))
    return rows


@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant_with_admin(
    payload: PlatformTenantCreateRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: Annotated[Principal, Depends(get_current_principal)],
    request: Request,
) -> TenantResponse:
    await ensure_permissions_and_default_roles(session)
    _require_platform_operator(principal)

    if PermissionCode.TENANT_CREATE.value not in principal.permission_codes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing permission: {PermissionCode.TENANT_CREATE.value}",
        )

    admin_email = str(payload.tenant_admin_email).lower()
    existing_user = await session.scalar(select(User).where(User.email == admin_email))
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tenant admin email is already in use. Choose a unique email.",
        )

    slug = await _allocate_unique_tenant_slug(session, payload.name)

    tenant = Tenant(
        name=payload.name,
        slug=slug,
        default_locale=payload.default_locale,
        status=TenantStatus.ACTIVE,
        address_line1=_optional_address_line(payload.address_line1),
        address_line2=_optional_address_line(payload.address_line2),
        address_city=payload.address_city,
        address_state=payload.address_state,
        address_postal_code=payload.address_postal_code,
    )
    session.add(tenant)

    await session.flush()

    await get_branding_or_create(session, tenant.id)
    await ensure_permissions_and_default_roles(session)

    role = await get_tenant_role_or_404(session, "tenant_admin", tenant_id=tenant.id)
    display_name = (
        f"{payload.tenant_admin_first_name.strip()} "
        f"{payload.tenant_admin_last_name.strip()}"
    ).strip()
    admin_user = User(
        tenant_id=tenant.id,
        email=admin_email,
        display_name=display_name,
        password_hash=hash_password(TENANT_ADMIN_INITIAL_PASSWORD),
        status=UserStatus.ACTIVE,
        token_version=1,
    )
    session.add(admin_user)
    await session.flush()
    session.add(
        UserRoleBinding(
            user_id=admin_user.id,
            role_id=role.id,
            scope=BindingScope.TENANT,
            tenant_id=tenant.id,
            location_id=None,
        )
    )

    await write_audit_log(
        session,
        actor_type=AuditActorType.USER,
        actor_id=str(principal.user_id),
        tenant_id=tenant.id,
        action=AuditAction.TENANT_PROVISIONED,
        outcome=AuditOutcome.SUCCESS,
        resource_type="tenant",
        resource_id=str(tenant.id),
        request_id=getattr(request.state, "request_id", None),
        metadata=audit_metadata(
            actor=await audit_actor_from_principal(session, principal),
            after=tenant_audit_snapshot(tenant),
            admin_email=admin_email,
        ),
    )

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not create tenant or tenant admin user.",
        ) from exc

    await session.refresh(tenant)
    return TenantResponse.model_validate(tenant, from_attributes=True)


@router.patch("/tenants/{tenant_id}/address", response_model=PlatformTenantListEntry)
async def patch_platform_tenant_address(
    tenant_id: UUID,
    payload: PlatformTenantAddressPatchRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: Annotated[Principal, Depends(get_current_principal)],
    request: Request,
) -> PlatformTenantListEntry:
    await ensure_permissions_and_default_roles(session)
    _require_platform_operator(principal)

    if PermissionCode.TENANT_UPDATE.value not in principal.permission_codes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing permission: {PermissionCode.TENANT_UPDATE.value}",
        )

    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one address field to update.",
        )

    before = tenant_audit_snapshot(tenant)
    for field_name, raw in updates.items():
        if isinstance(raw, str):
            setattr(tenant, field_name, _optional_address_line(raw))
        else:
            setattr(tenant, field_name, raw)

    await write_audit_log(
        session,
        actor_type=AuditActorType.USER,
        actor_id=str(principal.user_id),
        tenant_id=tenant.id,
        action=AuditAction.TENANT_PLATFORM_UPDATED,
        outcome=AuditOutcome.SUCCESS,
        resource_type="tenant",
        resource_id=str(tenant.id),
        request_id=getattr(request.state, "request_id", None),
        metadata=audit_metadata(
            actor=await audit_actor_from_principal(session, principal),
            before=before,
            after=tenant_audit_snapshot(tenant),
            change="address",
            fields=sorted(updates.keys()),
        ),
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not update tenant address.",
        ) from exc

    await session.refresh(tenant)
    admin_map = await _map_primary_tenant_admin_users(session, [tenant.id])
    return _platform_list_row(tenant, admin_map.get(tenant.id))


@router.patch("/tenants/{tenant_id}", response_model=TenantResponse)
async def patch_platform_tenant(
    tenant_id: UUID,
    payload: PlatformTenantPatchRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: Annotated[Principal, Depends(get_current_principal)],
    request: Request,
) -> TenantResponse:
    await ensure_permissions_and_default_roles(session)
    _require_platform_operator(principal)

    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one field to update.",
        )

    before = tenant_audit_snapshot(tenant)
    touched_profile = _PLATFORM_TENANT_PROFILE_FIELDS.intersection(updates.keys())
    if touched_profile and PermissionCode.TENANT_UPDATE.value not in principal.permission_codes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing permission: {PermissionCode.TENANT_UPDATE.value}",
        )

    new_status = updates.get("status")
    if new_status is not None and new_status != tenant.status:
        if new_status == TenantStatus.SUSPENDED:
            if PermissionCode.TENANT_SUSPEND.value not in principal.permission_codes:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Missing permission: {PermissionCode.TENANT_SUSPEND.value}",
                )
        elif new_status == TenantStatus.ACTIVE:
            if PermissionCode.TENANT_UPDATE.value not in principal.permission_codes:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Missing permission: {PermissionCode.TENANT_UPDATE.value}",
                )
        tenant.status = new_status
        tenant.suspended_at = datetime.now(UTC) if new_status == TenantStatus.SUSPENDED else None

    if "name" in updates:
        tenant.name = updates["name"].strip()
    if "slug" in updates:
        slug = updates["slug"].strip().lower()
        if not _SLUG_RE.fullmatch(slug):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid tenant slug.",
            )
        if await _tenant_slug_in_use(session, slug, tenant.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That tenant slug is already in use.",
            )
        tenant.slug = slug
    if "default_locale" in updates:
        tenant.default_locale = updates["default_locale"].strip()
    if "address_line1" in updates:
        tenant.address_line1 = _optional_address_line(updates["address_line1"])
    if "address_line2" in updates:
        tenant.address_line2 = _optional_address_line(updates["address_line2"])
    if "address_city" in updates:
        tenant.address_city = _optional_trimmed(updates["address_city"])
    if "address_state" in updates:
        tenant.address_state = _optional_trimmed(updates["address_state"])
    if "address_postal_code" in updates:
        tenant.address_postal_code = _optional_trimmed(updates["address_postal_code"])

    await write_audit_log(
        session,
        actor_type=AuditActorType.USER,
        actor_id=str(principal.user_id),
        tenant_id=tenant.id,
        action=AuditAction.TENANT_PLATFORM_UPDATED,
        outcome=AuditOutcome.SUCCESS,
        resource_type="tenant",
        resource_id=str(tenant.id),
        request_id=getattr(request.state, "request_id", None),
        metadata=audit_metadata(
            actor=await audit_actor_from_principal(session, principal),
            before=before,
            after=tenant_audit_snapshot(tenant),
            fields=sorted(updates.keys()),
        ),
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not update tenant.",
        ) from exc

    await session.refresh(tenant)
    return TenantResponse.model_validate(tenant, from_attributes=True)


@router.get("/audit-logs", response_model=list[AuditLogEntry])
async def get_platform_audit_logs(
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: Annotated[Principal, Depends(get_current_principal)],
    page: str,
    action: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[AuditLogEntry]:
    await ensure_permissions_and_default_roles(session)
    _require_platform_operator(principal)
    require_permission(principal, PermissionCode.AUDIT_READ)
    if page not in ("templates", "tenants", "users"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid page. Use templates, tenants, or users.",
        )
    rows = await list_platform_audit_logs(
        session,
        page=page,
        action_filter=action,
        q=q,
        limit=limit,
        offset=offset,
    )
    return serialize_audit_log_rows(rows)
