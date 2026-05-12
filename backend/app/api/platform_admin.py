"""Platform (super admin) API: manage platform operators and tenant onboarding."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.platform_schemas import (
    PlatformTenantCreateRequest,
    SuperAdminUserCreateRequest,
    SuperAdminUserResponse,
)
from app.api.tenant_schemas import TenantResponse
from app.api.tenants import (
    ensure_permissions_and_default_roles,
    get_branding_or_create,
    get_tenant_role_or_404,
)
from app.auth.dependencies import get_current_principal
from app.auth.passwords import hash_password
from app.auth.principal import Principal
from app.core.database import get_session
from app.models.auth import Role, User, UserRoleBinding
from app.models.enums import (
    AuditAction,
    AuditActorType,
    AuditOutcome,
    BindingScope,
    PermissionCode,
    TenantStatus,
    UserStatus,
)
from app.models.tenant import Tenant
from app.services.audit import write_audit_log

router = APIRouter(prefix="/platform", tags=["platform"])

TENANT_ADMIN_INITIAL_PASSWORD = "test1234"


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


@router.post(
    "/super-admin-users",
    response_model=SuperAdminUserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_super_admin_user(
    payload: SuperAdminUserCreateRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: Annotated[Principal, Depends(get_current_principal)],
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

    user = User(
        tenant_id=None,
        email=normalized_email,
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
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
        metadata={"email": user.email},
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


@router.get("/tenants", response_model=list[TenantResponse])
async def list_all_tenants(
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: Annotated[Principal, Depends(get_current_principal)],
) -> list[TenantResponse]:
    await ensure_permissions_and_default_roles(session)
    _require_platform_operator(principal)

    tenants = await session.scalars(select(Tenant).order_by(Tenant.name, Tenant.slug))
    return [TenantResponse.model_validate(t, from_attributes=True) for t in tenants]


@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant_with_admin(
    payload: PlatformTenantCreateRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    principal: Annotated[Principal, Depends(get_current_principal)],
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

    slug_taken = await session.scalar(select(Tenant.id).where(Tenant.slug == payload.slug))
    if slug_taken is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tenant slug already exists.",
        )

    tenant = Tenant(
        name=payload.name,
        slug=payload.slug,
        default_locale=payload.default_locale,
        status=TenantStatus.ACTIVE,
    )
    session.add(tenant)

    await session.flush()

    await get_branding_or_create(session, tenant.id)
    await ensure_permissions_and_default_roles(session)

    role = await get_tenant_role_or_404(session, "tenant_admin", tenant_id=tenant.id)
    display_name = payload.tenant_admin_display_name or admin_email.split("@", maxsplit=1)[0]
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
        action=AuditAction.USER_CREATED,
        outcome=AuditOutcome.SUCCESS,
        resource_type="tenant",
        resource_id=str(tenant.id),
        metadata={"operation": "platform_create_tenant", "admin_email": admin_email},
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
