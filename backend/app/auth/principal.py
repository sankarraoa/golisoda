from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth import Permission, Role, RolePermission, User, UserRoleBinding


@dataclass(frozen=True)
class Principal:
    user_id: UUID
    email: str
    tenant_id: UUID | None
    role_codes: list[str]
    permission_codes: list[str]
    location_ids: list[UUID]
    token_version: int


async def load_principal(session: AsyncSession, user: User) -> Principal:
    role_rows = await session.execute(
        select(Role.code, UserRoleBinding.location_id)
        .join(UserRoleBinding, UserRoleBinding.role_id == Role.id)
        .where(UserRoleBinding.user_id == user.id)
    )
    role_codes: list[str] = []
    location_ids: list[UUID] = []
    for role_code, location_id in role_rows:
        role_codes.append(role_code)
        if location_id:
            location_ids.append(location_id)

    permission_rows = await session.execute(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(UserRoleBinding, UserRoleBinding.role_id == Role.id)
        .where(UserRoleBinding.user_id == user.id)
    )
    permission_codes = sorted(
        {permission_code.value for permission_code in permission_rows.scalars()}
    )

    return Principal(
        user_id=user.id,
        email=user.email,
        tenant_id=user.tenant_id,
        role_codes=sorted(set(role_codes)),
        permission_codes=permission_codes,
        location_ids=sorted(set(location_ids)),
        token_version=user.token_version,
    )
