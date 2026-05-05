import pytest
from fastapi import HTTPException

from app.auth.role_rules import require_tenant_assignable_role, require_valid_role_scope
from app.models.enums import BindingScope


def test_tenant_assignable_roles_are_allowed() -> None:
    require_tenant_assignable_role("tenant_admin")
    require_tenant_assignable_role("location_manager")
    require_tenant_assignable_role("analyst")


def test_internal_or_global_roles_are_rejected_for_tenant_assignment() -> None:
    with pytest.raises(HTTPException) as exc:
        require_tenant_assignable_role("super_admin")

    assert exc.value.status_code == 403


def test_location_manager_requires_location_scope() -> None:
    with pytest.raises(HTTPException) as exc:
        require_valid_role_scope("location_manager", BindingScope.TENANT)

    assert exc.value.status_code == 422
    require_valid_role_scope("location_manager", BindingScope.LOCATION)


def test_tenant_roles_reject_global_scope() -> None:
    with pytest.raises(HTTPException) as exc:
        require_valid_role_scope("tenant_admin", BindingScope.GLOBAL)

    assert exc.value.status_code == 422
