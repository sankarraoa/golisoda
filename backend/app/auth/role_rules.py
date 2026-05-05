from fastapi import HTTPException, status

from app.models.enums import BindingScope

TENANT_ASSIGNABLE_ROLE_CODES = {"tenant_admin", "location_manager", "analyst"}


def require_tenant_assignable_role(role_code: str) -> None:
    if role_code not in TENANT_ASSIGNABLE_ROLE_CODES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role cannot be assigned in tenant scope: {role_code}",
        )


def require_valid_role_scope(role_code: str, scope: BindingScope) -> None:
    if role_code == "location_manager" and scope != BindingScope.LOCATION:
        raise HTTPException(
            status_code=422,
            detail="location_manager role requires location scope.",
        )
    if role_code in {"tenant_admin", "analyst"} and scope not in {
        BindingScope.TENANT,
        BindingScope.LOCATION,
    }:
        raise HTTPException(
            status_code=422,
            detail=f"{role_code} role requires tenant or location scope.",
        )
