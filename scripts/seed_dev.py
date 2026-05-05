import asyncio
import sys
from pathlib import Path
from uuid import UUID

_BACKEND_ROOT = Path(__file__).resolve().parent.parent / "backend"
if _BACKEND_ROOT.is_dir():
    sys.path.insert(0, str(_BACKEND_ROOT))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.passwords import hash_password
from app.core.database import get_session_factory
from app.models.auth import Permission, Role, RolePermission, User, UserRoleBinding
from app.models.enums import BindingScope, PermissionCode, TenantStatus, UserStatus
from app.models.tenant import Location, Tenant, TenantBranding

DEV_PASSWORD = "Admin@12345"

ROLE_PERMISSIONS: dict[str, set[PermissionCode]] = {
    "super_admin": set(PermissionCode),
    "tenant_admin": {
        PermissionCode.TENANT_READ,
        PermissionCode.TENANT_UPDATE,
        PermissionCode.USER_CREATE,
        PermissionCode.USER_READ,
        PermissionCode.USER_UPDATE,
        PermissionCode.ROLE_ASSIGN,
        PermissionCode.LOCATION_CREATE,
        PermissionCode.LOCATION_READ,
        PermissionCode.LOCATION_UPDATE,
        PermissionCode.BRANDING_READ,
        PermissionCode.BRANDING_UPDATE,
        PermissionCode.SURVEY_CREATE,
        PermissionCode.SURVEY_READ,
        PermissionCode.SURVEY_UPDATE,
        PermissionCode.SURVEY_PUBLISH,
        PermissionCode.CHANNEL_CREATE,
        PermissionCode.CHANNEL_READ,
        PermissionCode.CHANNEL_UPDATE,
    },
    "location_manager": {
        PermissionCode.LOCATION_READ,
        PermissionCode.LOCATION_UPDATE,
        PermissionCode.BRANDING_READ,
        PermissionCode.SURVEY_READ,
        PermissionCode.CHANNEL_READ,
    },
    "analyst": {
        PermissionCode.TENANT_READ,
        PermissionCode.LOCATION_READ,
        PermissionCode.BRANDING_READ,
        PermissionCode.SURVEY_READ,
        PermissionCode.CHANNEL_READ,
    },
    "support_operator": {
        PermissionCode.TENANT_READ,
        PermissionCode.USER_READ,
        PermissionCode.AUDIT_READ,
    },
}

ROLE_NAMES = {
    "super_admin": "Super Admin",
    "tenant_admin": "Tenant Admin",
    "location_manager": "Location Manager",
    "analyst": "Analyst",
    "support_operator": "Support Operator",
}


async def get_or_create_permission(
    session: AsyncSession,
    code: PermissionCode,
) -> Permission:
    permission = await session.scalar(select(Permission).where(Permission.code == code))
    if permission:
        return permission

    permission = Permission(code=code, description=f"Allows {code.value}")
    session.add(permission)
    await session.flush()
    return permission


async def get_or_create_role(
    session: AsyncSession,
    *,
    code: str,
    tenant_id: UUID | None,
) -> Role:
    role = await session.scalar(
        select(Role).where(
            Role.code == code,
            Role.tenant_id.is_(None) if tenant_id is None else Role.tenant_id == tenant_id,
        )
    )
    if role:
        return role

    role = Role(
        tenant_id=tenant_id,
        code=code,
        name=ROLE_NAMES[code],
        is_system=True,
    )
    session.add(role)
    await session.flush()
    return role


async def ensure_role_permission(
    session: AsyncSession,
    *,
    role: Role,
    permission: Permission,
) -> None:
    existing = await session.scalar(
        select(RolePermission).where(
            RolePermission.role_id == role.id,
            RolePermission.permission_id == permission.id,
        )
    )
    if existing is None:
        session.add(RolePermission(role_id=role.id, permission_id=permission.id))


async def get_or_create_tenant(session: AsyncSession) -> Tenant:
    tenant = await session.scalar(select(Tenant).where(Tenant.slug == "demo-tenant"))
    if tenant:
        return tenant

    tenant = Tenant(
        name="Demo Tenant",
        slug="demo-tenant",
        default_locale="en",
        status=TenantStatus.ACTIVE,
    )
    session.add(tenant)
    await session.flush()
    session.add(TenantBranding(tenant_id=tenant.id))
    await session.flush()
    return tenant


async def get_or_create_location(session: AsyncSession, tenant: Tenant) -> Location:
    location = await session.scalar(
        select(Location).where(Location.tenant_id == tenant.id, Location.code == "BLR-001")
    )
    if location:
        return location

    location = Location(
        tenant_id=tenant.id,
        name="Demo Bengaluru Store",
        code="BLR-001",
        city="Bengaluru",
        region="Karnataka",
        is_active=True,
    )
    session.add(location)
    await session.flush()
    return location


async def get_or_create_user(
    session: AsyncSession,
    *,
    email: str,
    display_name: str,
    tenant_id: UUID | None,
) -> User:
    normalized_email = email.lower()
    user = await session.scalar(
        select(User).where(
            User.email == normalized_email,
            User.tenant_id.is_(None) if tenant_id is None else User.tenant_id == tenant_id,
        )
    )
    if user:
        return user

    user = User(
        tenant_id=tenant_id,
        email=normalized_email,
        display_name=display_name,
        password_hash=hash_password(DEV_PASSWORD),
        status=UserStatus.ACTIVE,
        token_version=1,
    )
    session.add(user)
    await session.flush()
    return user


def ensure_dev_demo_login(user: User) -> None:
    """Re-run safe: keeps README demo accounts loggable (repairs disabled / changed passwords)."""

    user.status = UserStatus.ACTIVE
    user.password_hash = hash_password(DEV_PASSWORD)


async def ensure_role_binding(
    session: AsyncSession,
    *,
    user: User,
    role: Role,
    scope: BindingScope,
    tenant_id: UUID | None = None,
    location_id: UUID | None = None,
) -> None:
    existing = await session.scalar(
        select(UserRoleBinding).where(
            UserRoleBinding.user_id == user.id,
            UserRoleBinding.role_id == role.id,
            UserRoleBinding.scope == scope,
            UserRoleBinding.tenant_id.is_(None)
            if tenant_id is None
            else UserRoleBinding.tenant_id == tenant_id,
            UserRoleBinding.location_id.is_(None)
            if location_id is None
            else UserRoleBinding.location_id == location_id,
        )
    )
    if existing is None:
        session.add(
            UserRoleBinding(
                user_id=user.id,
                role_id=role.id,
                scope=scope,
                tenant_id=tenant_id,
                location_id=location_id,
            )
        )


async def seed() -> None:
    async with get_session_factory()() as session:
        permissions = {
            permission_code: await get_or_create_permission(session, permission_code)
            for permission_code in PermissionCode
        }

        roles: dict[str, Role] = {}
        for role_code, permission_codes in ROLE_PERMISSIONS.items():
            role = await get_or_create_role(session, code=role_code, tenant_id=None)
            roles[role_code] = role
            for permission_code in permission_codes:
                await ensure_role_permission(
                    session,
                    role=role,
                    permission=permissions[permission_code],
                )

        tenant = await get_or_create_tenant(session)
        location = await get_or_create_location(session, tenant)

        super_admin = await get_or_create_user(
            session,
            email="superadmin@example.com",
            display_name="Local Super Admin",
            tenant_id=None,
        )
        tenant_admin = await get_or_create_user(
            session,
            email="admin@example.com",
            display_name="Demo Tenant Admin",
            tenant_id=tenant.id,
        )
        ensure_dev_demo_login(super_admin)
        ensure_dev_demo_login(tenant_admin)

        await ensure_role_binding(
            session,
            user=super_admin,
            role=roles["super_admin"],
            scope=BindingScope.GLOBAL,
        )
        await ensure_role_binding(
            session,
            user=tenant_admin,
            role=roles["tenant_admin"],
            scope=BindingScope.TENANT,
            tenant_id=tenant.id,
        )

        await session.commit()

    print("Seed data ready.")
    print(f"Super admin: superadmin@example.com / {DEV_PASSWORD}")
    print(f"Tenant admin: admin@example.com / {DEV_PASSWORD}")
    print(f"Demo tenant: {tenant.slug}")
    print(f"Demo location: {location.code}")


if __name__ == "__main__":
    asyncio.run(seed())
