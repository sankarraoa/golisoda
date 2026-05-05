from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models.enums import BindingScope, PermissionCode, TenantStatus, UserStatus


class TenantCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$")
    default_locale: str = Field(default="en", min_length=2, max_length=16)


class TenantResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    default_locale: str
    status: TenantStatus
    created_at: datetime
    updated_at: datetime


class BrandingUpdateRequest(BaseModel):
    logo_url: str | None = None
    primary_color: str | None = Field(default=None, max_length=16)
    secondary_color: str | None = Field(default=None, max_length=16)
    thank_you_text: str | None = Field(default=None, min_length=1)


class BrandingResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    logo_url: str | None
    primary_color: str | None
    secondary_color: str | None
    thank_you_text: str
    created_at: datetime
    updated_at: datetime


class PermissionResponse(BaseModel):
    id: UUID
    code: PermissionCode
    description: str | None


class RoleCreateRequest(BaseModel):
    code: str = Field(pattern=r"^[a-z0-9_:-]{2,80}$")
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    permission_codes: list[PermissionCode] = []


class RoleUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    permission_codes: list[PermissionCode] | None = None


class RoleResponse(BaseModel):
    id: UUID
    tenant_id: UUID | None
    code: str
    name: str
    description: str | None
    is_system: bool
    permission_codes: list[PermissionCode]
    created_at: datetime
    updated_at: datetime


class LocationCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1, max_length=80)
    city: str | None = Field(default=None, max_length=120)
    region: str | None = Field(default=None, max_length=120)
    address: str | None = None


class LocationUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    code: str | None = Field(default=None, min_length=1, max_length=80)
    city: str | None = Field(default=None, max_length=120)
    region: str | None = Field(default=None, max_length=120)
    address: str | None = None
    is_active: bool | None = None


class LocationResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    code: str
    city: str | None
    region: str | None
    address: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TenantUserCreateRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8)


class TenantUserUpdateRequest(BaseModel):
    email: EmailStr | None = None
    display_name: str | None = Field(default=None, min_length=1, max_length=255)
    status: UserStatus | None = None
    role_code: str | None = Field(default=None, min_length=1, max_length=80)
    location_ids: list[UUID] | None = None


class RoleBindingResponse(BaseModel):
    id: UUID
    role_code: str
    scope: BindingScope
    tenant_id: UUID | None
    location_id: UUID | None


class TenantUserResponse(BaseModel):
    id: UUID
    tenant_id: UUID | None
    email: EmailStr
    display_name: str
    status: UserStatus
    token_version: int
    role_bindings: list[RoleBindingResponse] = []
    created_at: datetime
    updated_at: datetime


class RoleAssignmentRequest(BaseModel):
    role_code: str = Field(min_length=1, max_length=80)
    scope: BindingScope = BindingScope.TENANT
    location_id: UUID | None = None

    @model_validator(mode="after")
    def validate_scope_fields(self) -> "RoleAssignmentRequest":
        if self.scope == BindingScope.LOCATION and self.location_id is None:
            raise ValueError("location_id is required for location-scoped role assignment.")
        if self.scope == BindingScope.TENANT and self.location_id is not None:
            raise ValueError("location_id must be empty for tenant-scoped role assignment.")
        if self.scope == BindingScope.GLOBAL:
            raise ValueError("global role assignment is not allowed from tenant user APIs.")
        return self
