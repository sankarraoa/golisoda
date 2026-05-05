from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.auth.authorization import (
    can_access_tenant,
    has_permission,
    require_permission,
    require_tenant_scope,
)
from app.auth.principal import Principal
from app.models.enums import PermissionCode


def make_principal(
    *,
    tenant_id=None,
    permissions: list[str] | None = None,
) -> Principal:
    return Principal(
        user_id=uuid4(),
        email="user@example.com",
        tenant_id=tenant_id,
        role_codes=["test_role"],
        permission_codes=permissions or [],
        location_ids=[],
        token_version=1,
    )


def test_super_admin_can_access_any_tenant() -> None:
    principal = make_principal(tenant_id=None)

    assert can_access_tenant(principal, uuid4())


def test_tenant_admin_can_access_only_own_tenant() -> None:
    tenant_id = uuid4()
    principal = make_principal(tenant_id=tenant_id)

    assert can_access_tenant(principal, tenant_id)
    assert not can_access_tenant(principal, uuid4())


def test_require_tenant_scope_raises_for_cross_tenant_access() -> None:
    principal = make_principal(tenant_id=uuid4())

    with pytest.raises(HTTPException) as exc:
        require_tenant_scope(principal, uuid4())

    assert exc.value.status_code == 403


def test_permission_check_uses_permission_codes() -> None:
    principal = make_principal(permissions=[PermissionCode.TENANT_READ.value])

    assert has_permission(principal, PermissionCode.TENANT_READ)
    with pytest.raises(HTTPException) as exc:
        require_permission(principal, PermissionCode.TENANT_CREATE)

    assert exc.value.status_code == 403
