from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, computed_field, model_validator

from app.api.tenant_schemas import TenantResponse
from app.models.enums import TenantStatus, UserStatus


def _split_display_name(display_name: str) -> tuple[str, str]:
    name = display_name.strip()
    if not name:
        return "", ""
    parts = name.split(None, 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


class SuperAdminUserResponse(BaseModel):
    id: UUID
    email: EmailStr
    display_name: str
    status: UserStatus
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def first_name(self) -> str:
        return _split_display_name(self.display_name)[0]

    @computed_field
    @property
    def last_name(self) -> str:
        return _split_display_name(self.display_name)[1]

    @computed_field
    @property
    def role(self) -> str:
        return "Super Administrator"


class SuperAdminUserCreateRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    email: EmailStr


class SuperAdminUserPatchRequest(BaseModel):
    status: UserStatus

    @model_validator(mode="after")
    def status_allowed(self) -> SuperAdminUserPatchRequest:
        if self.status not in (UserStatus.ACTIVE, UserStatus.DISABLED):
            raise ValueError("status must be active or disabled.")
        return self


class PlatformTenantCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    default_locale: str = Field(default="en", min_length=2, max_length=16)
    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    address_city: str = Field(min_length=1, max_length=120)
    address_state: str = Field(min_length=1, max_length=120)
    address_postal_code: str = Field(min_length=1, max_length=32)
    tenant_admin_first_name: str = Field(min_length=1, max_length=120)
    tenant_admin_last_name: str = Field(min_length=1, max_length=120)
    tenant_admin_email: EmailStr


class PlatformTenantAddressPatchRequest(BaseModel):
    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    address_city: str | None = Field(default=None, max_length=120)
    address_state: str | None = Field(default=None, max_length=120)
    address_postal_code: str | None = Field(default=None, max_length=32)


class PlatformTenantPatchRequest(BaseModel):
    """Partial tenant updates from the platform console (merge via exclude_unset)."""

    status: TenantStatus | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(
        default=None,
        min_length=3,
        max_length=80,
        pattern=r"^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$",
    )
    default_locale: str | None = Field(default=None, min_length=2, max_length=16)
    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    address_city: str | None = Field(default=None, max_length=120)
    address_state: str | None = Field(default=None, max_length=120)
    address_postal_code: str | None = Field(default=None, max_length=32)

    @model_validator(mode="after")
    def status_allowed_when_set(self) -> PlatformTenantPatchRequest:
        allowed = (TenantStatus.ACTIVE, TenantStatus.SUSPENDED)
        if self.status is not None and self.status not in allowed:
            raise ValueError("status must be active or suspended.")
        return self


class PlatformTenantListEntry(TenantResponse):
    """Platform tenant row including provisioned administrator contact."""

    administrator_email: EmailStr | None = None
    administrator_display_name: str | None = None
