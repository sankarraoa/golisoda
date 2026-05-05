from uuid import UUID

from fastapi import HTTPException, status

from app.auth.principal import Principal
from app.models.enums import PermissionCode


def has_permission(principal: Principal, permission: PermissionCode) -> bool:
    return permission.value in principal.permission_codes


def require_permission(principal: Principal, permission: PermissionCode) -> None:
    if not has_permission(principal, permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing permission: {permission.value}",
        )


def can_access_tenant(principal: Principal, tenant_id: UUID) -> bool:
    if principal.tenant_id is None:
        return True
    return principal.tenant_id == tenant_id


def require_tenant_scope(principal: Principal, tenant_id: UUID) -> None:
    if not can_access_tenant(principal, tenant_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant scope denied.",
        )
