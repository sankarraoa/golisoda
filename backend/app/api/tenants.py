from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.tenant_schemas import (
    BrandingResponse,
    BrandingUpdateRequest,
    LocationCreateRequest,
    LocationResponse,
    LocationUpdateRequest,
    LogoImportUrlRequest,
    PermissionResponse,
    RoleAssignmentRequest,
    RoleBindingResponse,
    RoleCreateRequest,
    RoleResponse,
    RoleUpdateRequest,
    TenantCreateRequest,
    TenantResponse,
    TenantUpdateRequest,
    TenantUserCreateRequest,
    TenantUserResponse,
    TenantUserUpdateRequest,
)
from app.auth.authorization import require_permission, require_tenant_scope
from app.auth.dependencies import get_current_principal
from app.auth.passwords import hash_password
from app.auth.principal import Principal
from app.auth.role_rules import require_valid_role_scope
from app.core.config import get_settings
from app.core.database import get_session
from app.models.auth import Permission, Role, RolePermission, User, UserRoleBinding
from app.models.enums import (
    AuditAction,
    AuditActorType,
    AuditOutcome,
    BindingScope,
    PermissionCode,
    UserStatus,
)
from app.models.tenant import Location, Tenant, TenantBranding
from app.schemas.survey_theme import SurveyThemeConfig
from app.services.audit import write_audit_log
from app.services.audit_context import (
    audit_actor_from_principal,
    audit_metadata,
    branding_audit_snapshot,
    location_audit_snapshot,
    role_definition_snapshot,
    tenant_audit_snapshot,
    user_bindings_snapshot,
    user_profile_audit_snapshot,
)
from app.services.branding_assets import (
    BrandingAssetError,
    download_logo_bytes,
    public_logo_url,
    remove_local_logo_file,
    validate_and_prepare_logo_bytes,
    write_logo_file,
)

router = APIRouter(prefix="/tenants", tags=["tenants"])

ROLE_DEFAULTS: dict[str, dict[str, object]] = {
    "platform_super_admin": {
        "name": "Platform Super Admin",
        "description": "Platform console access and full tenant administration.",
        "permissions": [permission for permission in PermissionCode],
    },
    "tenant_admin": {
        "name": "Tenant Admin",
        "description": "Full organization administration.",
        "permissions": [permission for permission in PermissionCode],
    },
    "location_manager": {
        "name": "Location Manager",
        "description": "Manage scoped locations and feedback workflows.",
        "permissions": [
            PermissionCode.TENANT_READ,
            PermissionCode.LOCATION_READ,
            PermissionCode.LOCATION_UPDATE,
            PermissionCode.SURVEY_READ,
            PermissionCode.SURVEY_CREATE,
            PermissionCode.SURVEY_UPDATE,
            PermissionCode.SURVEY_COPY,
            PermissionCode.SURVEY_PUBLISH,
            PermissionCode.CHANNEL_READ,
            PermissionCode.CHANNEL_CREATE,
            PermissionCode.CHANNEL_UPDATE,
            PermissionCode.RESPONSE_READ,
            PermissionCode.ANALYTICS_READ,
        ],
    },
    "analyst": {
        "name": "Analyst",
        "description": "Read responses and analytics.",
        "permissions": [
            PermissionCode.TENANT_READ,
            PermissionCode.LOCATION_READ,
            PermissionCode.SURVEY_READ,
            PermissionCode.CHANNEL_READ,
            PermissionCode.RESPONSE_READ,
            PermissionCode.ANALYTICS_READ,
        ],
    },
}


async def get_tenant_or_404(session: AsyncSession, tenant_id: UUID) -> Tenant:
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    return tenant


async def get_branding_or_create(session: AsyncSession, tenant_id: UUID) -> TenantBranding:
    branding = await session.scalar(
        select(TenantBranding).where(TenantBranding.tenant_id == tenant_id)
    )
    if branding is not None:
        return branding

    branding = TenantBranding(tenant_id=tenant_id)
    session.add(branding)
    await session.flush()
    return branding


async def get_tenant_user_or_404(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    user_id: UUID,
) -> User:
    user = await session.get(User, user_id)
    if user is None or user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


async def get_tenant_role_or_404(
    session: AsyncSession,
    role_code: str,
    tenant_id: UUID | None = None,
) -> Role:
    role = await session.scalar(
        select(Role).where(
            Role.code == role_code,
            (Role.tenant_id == tenant_id) | Role.tenant_id.is_(None),
        )
    )
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found.")
    return role


async def get_location_or_404(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    location_id: UUID,
) -> Location:
    location = await session.scalar(
        select(Location).where(Location.id == location_id, Location.tenant_id == tenant_id)
    )
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found.")
    return location


def is_location_scoped(principal: Principal) -> bool:
    return len(principal.location_ids) > 0


async def serialize_tenant_user(session: AsyncSession, user: User) -> TenantUserResponse:
    role_rows = await session.execute(
        select(UserRoleBinding, Role.code)
        .join(Role, Role.id == UserRoleBinding.role_id)
        .where(UserRoleBinding.user_id == user.id)
        .order_by(Role.code)
    )
    role_bindings = [
        RoleBindingResponse(
            id=binding.id,
            role_code=role_code,
            scope=binding.scope,
            tenant_id=binding.tenant_id,
            location_id=binding.location_id,
        )
        for binding, role_code in role_rows
    ]
    return TenantUserResponse(
        id=user.id,
        tenant_id=user.tenant_id,
        email=user.email,
        display_name=user.display_name,
        status=user.status,
        token_version=user.token_version,
        role_bindings=role_bindings,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


async def ensure_permissions_and_default_roles(session: AsyncSession) -> None:
    permission_by_code = {
        permission.code: permission
        for permission in await session.scalars(select(Permission))
    }
    for permission_code in PermissionCode:
        if permission_code not in permission_by_code:
            permission = Permission(code=permission_code, description=permission_code.value)
            session.add(permission)
            permission_by_code[permission_code] = permission
    await session.flush()

    for role_code, role_data in ROLE_DEFAULTS.items():
        role = await session.scalar(
            select(Role).where(Role.code == role_code, Role.tenant_id.is_(None))
        )
        if role is None:
            role = Role(
                tenant_id=None,
                code=role_code,
                name=str(role_data["name"]),
                description=str(role_data["description"]),
                is_system=True,
            )
            session.add(role)
            await session.flush()
        existing_permission_ids = {
            permission_id
            for permission_id in await session.scalars(
                select(RolePermission.permission_id).where(RolePermission.role_id == role.id)
            )
        }
        for permission_code in role_data["permissions"]:
            permission = permission_by_code[permission_code]
            if permission.id not in existing_permission_ids:
                session.add(RolePermission(role_id=role.id, permission_id=permission.id))


async def serialize_role(session: AsyncSession, role: Role) -> RoleResponse:
    permission_codes = await session.scalars(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == role.id)
        .order_by(Permission.code)
    )
    return RoleResponse(
        id=role.id,
        tenant_id=role.tenant_id,
        code=role.code,
        name=role.name,
        description=role.description,
        is_system=role.is_system,
        permission_codes=list(permission_codes),
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


@router.get("", response_model=list[TenantResponse])
async def list_tenants(
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[TenantResponse]:
    """Global users see all tenants; tenant-bound users see only their tenant."""
    require_permission(principal, PermissionCode.TENANT_READ)

    if principal.tenant_id is None:
        tenants = await session.scalars(select(Tenant).order_by(Tenant.name, Tenant.slug))
        return [TenantResponse.model_validate(tenant, from_attributes=True) for tenant in tenants]

    tenant = await get_tenant_or_404(session, principal.tenant_id)
    return [TenantResponse.model_validate(tenant, from_attributes=True)]


@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    _payload: TenantCreateRequest,
    _request: Request,
    _principal: Annotated[Principal, Depends(get_current_principal)],
    _session: Annotated[AsyncSession, Depends(get_session)],
) -> TenantResponse:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "Tenant creation is handled by the platform provisioning service, not this admin API."
        ),
    )


@router.get("/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TenantResponse:
    require_permission(principal, PermissionCode.TENANT_READ)
    require_tenant_scope(principal, tenant_id)

    tenant = await get_tenant_or_404(session, tenant_id)
    return TenantResponse.model_validate(tenant, from_attributes=True)


@router.patch("/{tenant_id}", response_model=TenantResponse)
async def update_tenant_profile(
    tenant_id: UUID,
    payload: TenantUpdateRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TenantResponse:
    require_permission(principal, PermissionCode.TENANT_UPDATE)
    require_tenant_scope(principal, tenant_id)
    tenant = await get_tenant_or_404(session, tenant_id)
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return TenantResponse.model_validate(tenant, from_attributes=True)
    before = tenant_audit_snapshot(tenant)
    for field_name, value in update_data.items():
        setattr(tenant, field_name, value)
    actor = await audit_actor_from_principal(session, principal)
    await write_audit_log(
        session,
        actor_type=AuditActorType.USER,
        actor_id=str(principal.user_id),
        tenant_id=tenant_id,
        action=AuditAction.TENANT_PROFILE_UPDATED,
        outcome=AuditOutcome.SUCCESS,
        resource_type="tenant",
        resource_id=str(tenant.id),
        request_id=getattr(request.state, "request_id", None),
        metadata=audit_metadata(
            actor=actor,
            before=before,
            after=tenant_audit_snapshot(tenant),
            fields=sorted(update_data.keys()),
        ),
    )
    await session.commit()
    await session.refresh(tenant)
    return TenantResponse.model_validate(tenant, from_attributes=True)


@router.get("/{tenant_id}/branding", response_model=BrandingResponse)
async def get_branding(
    tenant_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BrandingResponse:
    require_permission(principal, PermissionCode.BRANDING_READ)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)

    branding = await get_branding_or_create(session, tenant_id)
    await session.commit()
    await session.refresh(branding)
    return BrandingResponse.model_validate(branding, from_attributes=True)


@router.patch("/{tenant_id}/branding", response_model=BrandingResponse)
async def update_branding(
    tenant_id: UUID,
    payload: BrandingUpdateRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BrandingResponse:
    require_permission(principal, PermissionCode.BRANDING_UPDATE)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)

    branding = await get_branding_or_create(session, tenant_id)
    settings = get_settings()
    update_data = payload.model_dump(exclude_unset=True)

    if "logo_url" in update_data:
        if update_data["logo_url"] is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Logo cannot be set via this endpoint. Upload a file (POST branding/logo-file) "
                    "or import from a URL (POST branding/logo-import-url)."
                ),
            )
        remove_local_logo_file(
            branding.logo_url,
            tenant_id=tenant_id,
            upload_root=settings.tenant_branding_storage_path,
        )
        branding.logo_url = None
        del update_data["logo_url"]

    if "theme_overrides" in update_data and update_data["theme_overrides"] is not None:
        # Raises ValueError → FastAPI returns 422 with field-level details.
        SurveyThemeConfig(tokens=update_data["theme_overrides"])

    theme_touch = "theme_overrides" in update_data
    before_branding = branding_audit_snapshot(branding, redact_theme=theme_touch)

    for field_name, value in update_data.items():
        setattr(branding, field_name, value)

    actor = await audit_actor_from_principal(session, principal)
    await write_audit_log(
        session,
        actor_type=AuditActorType.USER,
        actor_id=str(principal.user_id),
        tenant_id=tenant_id,
        action=AuditAction.BRANDING_UPDATED,
        outcome=AuditOutcome.SUCCESS,
        resource_type="tenant_branding",
        resource_id=str(branding.id),
        request_id=getattr(request.state, "request_id", None),
        metadata=audit_metadata(
            actor=actor,
            before=before_branding,
            after=branding_audit_snapshot(branding, redact_theme=theme_touch),
            fields=sorted(update_data.keys()),
            change="branding_patch",
        ),
    )
    await session.commit()
    await session.refresh(branding)
    return BrandingResponse.model_validate(branding, from_attributes=True)


async def _persist_logo_bytes_and_response(
    *,
    session: AsyncSession,
    tenant_id: UUID,
    raw_in: bytes,
    principal: Principal,
    request: Request,
    branding: TenantBranding,
) -> BrandingResponse:
    settings = get_settings()
    upload_root = settings.tenant_branding_storage_path
    try:
        raw, ext = validate_and_prepare_logo_bytes(raw_in)
        filename = write_logo_file(upload_root, tenant_id, raw, ext)
    except BrandingAssetError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    remove_local_logo_file(branding.logo_url, tenant_id=tenant_id, upload_root=upload_root)
    before = branding_audit_snapshot(branding, redact_theme=False)
    branding.logo_url = public_logo_url(
        api_public_origin=settings.api_public_origin,
        tenant_id=tenant_id,
        filename=filename,
    )
    actor = await audit_actor_from_principal(session, principal)
    await write_audit_log(
        session,
        actor_type=AuditActorType.USER,
        actor_id=str(principal.user_id),
        tenant_id=tenant_id,
        action=AuditAction.BRANDING_UPDATED,
        outcome=AuditOutcome.SUCCESS,
        resource_type="tenant_branding",
        resource_id=str(branding.id),
        request_id=getattr(request.state, "request_id", None),
        metadata=audit_metadata(
            actor=actor,
            change="branding_logo",
            before=before,
            after=branding_audit_snapshot(branding, redact_theme=False),
        ),
    )
    await session.commit()
    await session.refresh(branding)
    return BrandingResponse.model_validate(branding, from_attributes=True)


@router.post("/{tenant_id}/branding/logo-file", response_model=BrandingResponse)
async def upload_branding_logo_file(
    tenant_id: UUID,
    request: Request,
    file: Annotated[UploadFile, File(description="PNG, JPEG, or WebP; max 5 MB")],
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BrandingResponse:
    require_permission(principal, PermissionCode.BRANDING_UPDATE)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)
    branding = await get_branding_or_create(session, tenant_id)
    raw_in = await file.read()
    return await _persist_logo_bytes_and_response(
        session=session,
        tenant_id=tenant_id,
        raw_in=raw_in,
        principal=principal,
        request=request,
        branding=branding,
    )


@router.post("/{tenant_id}/branding/logo-import-url", response_model=BrandingResponse)
async def import_branding_logo_from_url(
    tenant_id: UUID,
    payload: LogoImportUrlRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BrandingResponse:
    require_permission(principal, PermissionCode.BRANDING_UPDATE)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)
    branding = await get_branding_or_create(session, tenant_id)
    try:
        raw_fetch = await download_logo_bytes(payload.url)
    except BrandingAssetError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Could not download image ({exc}).",
        ) from exc

    return await _persist_logo_bytes_and_response(
        session=session,
        tenant_id=tenant_id,
        raw_in=raw_fetch,
        principal=principal,
        request=request,
        branding=branding,
    )


@router.get("/{tenant_id}/permissions", response_model=list[PermissionResponse])
async def list_permissions(
    tenant_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[PermissionResponse]:
    require_permission(principal, PermissionCode.ROLE_READ)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)
    await ensure_permissions_and_default_roles(session)
    await session.commit()

    permissions = await session.scalars(select(Permission).order_by(Permission.code))
    return [
        PermissionResponse(
            id=permission.id,
            code=permission.code,
            description=permission.description,
        )
        for permission in permissions
    ]


@router.get("/{tenant_id}/roles", response_model=list[RoleResponse])
async def list_roles(
    tenant_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[RoleResponse]:
    require_permission(principal, PermissionCode.ROLE_READ)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)
    await ensure_permissions_and_default_roles(session)
    await session.commit()

    roles = await session.scalars(
        select(Role)
        .where((Role.tenant_id == tenant_id) | Role.tenant_id.is_(None))
        .order_by(Role.is_system.desc(), Role.name)
    )
    return [await serialize_role(session, role) for role in roles]


@router.post("/{tenant_id}/roles", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    tenant_id: UUID,
    payload: RoleCreateRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RoleResponse:
    require_permission(principal, PermissionCode.ROLE_CREATE)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)
    await ensure_permissions_and_default_roles(session)

    role = Role(
        tenant_id=tenant_id,
        code=payload.code,
        name=payload.name,
        description=payload.description,
        is_system=False,
    )
    session.add(role)
    await session.flush()
    permissions = await session.scalars(
        select(Permission).where(Permission.code.in_(payload.permission_codes))
    )
    for permission in permissions:
        session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    actor = await audit_actor_from_principal(session, principal)
    await write_audit_log(
        session,
        actor_type=AuditActorType.USER,
        actor_id=str(principal.user_id),
        tenant_id=tenant_id,
        action=AuditAction.ROLE_CREATED,
        outcome=AuditOutcome.SUCCESS,
        resource_type="role",
        resource_id=str(role.id),
        request_id=getattr(request.state, "request_id", None),
        metadata=audit_metadata(
            actor=actor,
            after=await role_definition_snapshot(session, role),
        ),
    )
    await session.commit()
    await session.refresh(role)
    return await serialize_role(session, role)


@router.patch("/{tenant_id}/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    tenant_id: UUID,
    role_id: UUID,
    payload: RoleUpdateRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RoleResponse:
    require_permission(principal, PermissionCode.ROLE_UPDATE)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)
    await ensure_permissions_and_default_roles(session)

    role = await session.get(Role, role_id)
    if role is None or (role.tenant_id is not None and role.tenant_id != tenant_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found.")
    before = await role_definition_snapshot(session, role)
    if payload.name is not None:
        role.name = payload.name
    if payload.description is not None:
        role.description = payload.description
    if payload.permission_codes is not None:
        await session.execute(delete(RolePermission).where(RolePermission.role_id == role.id))
        permissions = await session.scalars(
            select(Permission).where(Permission.code.in_(payload.permission_codes))
        )
        for permission in permissions:
            session.add(RolePermission(role_id=role.id, permission_id=permission.id))

    await session.flush()
    actor = await audit_actor_from_principal(session, principal)
    await write_audit_log(
        session,
        actor_type=AuditActorType.USER,
        actor_id=str(principal.user_id),
        tenant_id=tenant_id,
        action=AuditAction.ROLE_UPDATED,
        outcome=AuditOutcome.SUCCESS,
        resource_type="role",
        resource_id=str(role.id),
        request_id=getattr(request.state, "request_id", None),
        metadata=audit_metadata(
            actor=actor,
            before=before,
            after=await role_definition_snapshot(session, role),
        ),
    )
    await session.commit()
    await session.refresh(role)
    return await serialize_role(session, role)


@router.get("/{tenant_id}/locations", response_model=list[LocationResponse])
async def list_locations(
    tenant_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[LocationResponse]:
    require_permission(principal, PermissionCode.LOCATION_READ)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)

    location_query = select(Location).where(Location.tenant_id == tenant_id)
    if is_location_scoped(principal):
        location_query = location_query.where(Location.id.in_(principal.location_ids))
    locations = await session.scalars(location_query.order_by(Location.name))
    return [
        LocationResponse.model_validate(location, from_attributes=True)
        for location in locations
    ]


@router.post(
    "/{tenant_id}/locations",
    response_model=LocationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_location(
    tenant_id: UUID,
    payload: LocationCreateRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> LocationResponse:
    require_permission(principal, PermissionCode.LOCATION_CREATE)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)

    location = Location(
        tenant_id=tenant_id,
        name=payload.name,
        code=payload.code,
        city=payload.city,
        region=payload.region,
        address=payload.address,
        is_active=True,
    )
    session.add(location)
    try:
        await session.flush()
        await write_audit_log(
            session,
            actor_type=AuditActorType.USER,
            actor_id=str(principal.user_id),
            tenant_id=tenant_id,
            action=AuditAction.LOCATION_CREATED,
            outcome=AuditOutcome.SUCCESS,
            resource_type="location",
            resource_id=str(location.id),
            request_id=getattr(request.state, "request_id", None),
            metadata=audit_metadata(
                actor=await audit_actor_from_principal(session, principal),
                after=location_audit_snapshot(location),
            ),
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Location code already exists for this tenant.",
        ) from exc

    await session.refresh(location)
    return LocationResponse.model_validate(location, from_attributes=True)


@router.patch("/{tenant_id}/locations/{location_id}", response_model=LocationResponse)
async def update_location(
    tenant_id: UUID,
    location_id: UUID,
    payload: LocationUpdateRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> LocationResponse:
    require_permission(principal, PermissionCode.LOCATION_UPDATE)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)
    location = await get_location_or_404(
        session,
        tenant_id=tenant_id,
        location_id=location_id,
    )
    if is_location_scoped(principal) and location.id not in principal.location_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found.")
    if payload.is_active is False:
        require_permission(principal, PermissionCode.LOCATION_ARCHIVE)

    update_data = payload.model_dump(exclude_unset=True)
    before = location_audit_snapshot(location)
    for field_name, value in update_data.items():
        setattr(location, field_name, value)

    try:
        await write_audit_log(
            session,
            actor_type=AuditActorType.USER,
            actor_id=str(principal.user_id),
            tenant_id=tenant_id,
            action=AuditAction.LOCATION_UPDATED,
            outcome=AuditOutcome.SUCCESS,
            resource_type="location",
            resource_id=str(location.id),
            request_id=getattr(request.state, "request_id", None),
            metadata=audit_metadata(
                actor=await audit_actor_from_principal(session, principal),
                before=before,
                after=location_audit_snapshot(location),
                fields=sorted(update_data.keys()),
            ),
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Location code already exists for this tenant.",
        ) from exc

    await session.refresh(location)
    return LocationResponse.model_validate(location, from_attributes=True)


@router.get("/{tenant_id}/users", response_model=list[TenantUserResponse])
async def list_tenant_users(
    tenant_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[TenantUserResponse]:
    require_permission(principal, PermissionCode.USER_READ)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)

    users = await session.scalars(
        select(User).where(User.tenant_id == tenant_id).order_by(User.email)
    )
    return [await serialize_tenant_user(session, user) for user in users]


@router.post(
    "/{tenant_id}/users",
    response_model=TenantUserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_tenant_user(
    tenant_id: UUID,
    payload: TenantUserCreateRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TenantUserResponse:
    require_permission(principal, PermissionCode.USER_CREATE)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)

    user = User(
        tenant_id=tenant_id,
        email=str(payload.email).lower(),
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
        status=UserStatus.ACTIVE,
        token_version=1,
    )
    session.add(user)

    try:
        await session.flush()
        actor = await audit_actor_from_principal(session, principal)
        await write_audit_log(
            session,
            actor_type=AuditActorType.USER,
            actor_id=str(principal.user_id),
            tenant_id=tenant_id,
            action=AuditAction.USER_CREATED,
            outcome=AuditOutcome.SUCCESS,
            resource_type="user",
            resource_id=str(user.id),
            request_id=getattr(request.state, "request_id", None),
            metadata=audit_metadata(
                actor=actor,
                after=user_profile_audit_snapshot(user),
            ),
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User email already exists for this tenant.",
        ) from exc

    await session.refresh(user)
    return await serialize_tenant_user(session, user)


@router.patch("/{tenant_id}/users/{user_id}", response_model=TenantUserResponse)
async def update_tenant_user(
    tenant_id: UUID,
    user_id: UUID,
    payload: TenantUserUpdateRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TenantUserResponse:
    require_permission(principal, PermissionCode.USER_UPDATE)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)
    user = await get_tenant_user_or_404(session, tenant_id=tenant_id, user_id=user_id)

    before_profile = user_profile_audit_snapshot(user)
    bindings_before = await user_bindings_snapshot(session, user.id)

    if payload.email is not None:
        user.email = str(payload.email).lower()
    if payload.display_name is not None:
        user.display_name = payload.display_name
    if payload.status is not None:
        if payload.status == UserStatus.DISABLED:
            require_permission(principal, PermissionCode.USER_ARCHIVE)
        if user.status != payload.status:
            user.token_version += 1
        user.status = payload.status

    if payload.role_code is not None:
        require_permission(principal, PermissionCode.ROLE_ASSIGN)
        role = await get_tenant_role_or_404(session, payload.role_code, tenant_id=tenant_id)
        location_ids = payload.location_ids or []
        for location_id in location_ids:
            await get_location_or_404(session, tenant_id=tenant_id, location_id=location_id)

        await session.execute(
            delete(UserRoleBinding).where(UserRoleBinding.user_id == user.id)
        )
        if location_ids:
            for location_id in location_ids:
                session.add(
                    UserRoleBinding(
                        user_id=user.id,
                        role_id=role.id,
                        scope=BindingScope.LOCATION,
                        tenant_id=tenant_id,
                        location_id=location_id,
                    )
                )
        else:
            session.add(
                UserRoleBinding(
                    user_id=user.id,
                    role_id=role.id,
                    scope=BindingScope.TENANT,
                    tenant_id=tenant_id,
                    location_id=None,
                )
            )
        user.token_version += 1

    actor = await audit_actor_from_principal(session, principal)
    after_profile = user_profile_audit_snapshot(user)
    bindings_after = await user_bindings_snapshot(session, user.id)
    await write_audit_log(
        session,
        actor_type=AuditActorType.USER,
        actor_id=str(principal.user_id),
        tenant_id=tenant_id,
        action=AuditAction.USER_UPDATED,
        outcome=AuditOutcome.SUCCESS,
        resource_type="user",
        resource_id=str(user.id),
        request_id=getattr(request.state, "request_id", None),
        metadata=audit_metadata(
            actor=actor,
            before={"profile": before_profile, "bindings": bindings_before},
            after={"profile": after_profile, "bindings": bindings_after},
        ),
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User email already exists for this tenant.",
        ) from exc

    await session.refresh(user)
    return await serialize_tenant_user(session, user)


@router.post(
    "/{tenant_id}/users/{user_id}/roles",
    response_model=TenantUserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def assign_user_role(
    tenant_id: UUID,
    user_id: UUID,
    payload: RoleAssignmentRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TenantUserResponse:
    require_permission(principal, PermissionCode.ROLE_ASSIGN)
    require_tenant_scope(principal, tenant_id)
    require_valid_role_scope(payload.role_code, payload.scope)
    await get_tenant_or_404(session, tenant_id)

    user = await get_tenant_user_or_404(session, tenant_id=tenant_id, user_id=user_id)
    role = await get_tenant_role_or_404(session, payload.role_code, tenant_id=tenant_id)
    if payload.location_id:
        await get_location_or_404(session, tenant_id=tenant_id, location_id=payload.location_id)

    existing = await session.scalar(
        select(UserRoleBinding).where(
            UserRoleBinding.user_id == user.id,
            UserRoleBinding.role_id == role.id,
            UserRoleBinding.scope == payload.scope,
            UserRoleBinding.tenant_id == tenant_id,
            UserRoleBinding.location_id.is_(None)
            if payload.location_id is None
            else UserRoleBinding.location_id == payload.location_id,
        )
    )

    if existing is None:
        session.add(
            UserRoleBinding(
                user_id=user.id,
                role_id=role.id,
                scope=payload.scope,
                tenant_id=tenant_id,
                location_id=payload.location_id,
            )
        )
        user.token_version += 1
        actor = await audit_actor_from_principal(session, principal)
        await write_audit_log(
            session,
            actor_type=AuditActorType.USER,
            actor_id=str(principal.user_id),
            tenant_id=tenant_id,
            action=AuditAction.ROLE_ASSIGNED,
            outcome=AuditOutcome.SUCCESS,
            resource_type="user",
            resource_id=str(user.id),
            request_id=getattr(request.state, "request_id", None),
            metadata=audit_metadata(
                actor=actor,
                role_code=role.code,
                scope=payload.scope.value,
                location_id=str(payload.location_id) if payload.location_id else None,
            ),
        )

    await session.commit()
    await session.refresh(user)
    return await serialize_tenant_user(session, user)
