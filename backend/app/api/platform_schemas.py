from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import UserStatus


class SuperAdminUserResponse(BaseModel):
    id: UUID
    email: EmailStr
    display_name: str
    status: UserStatus
    created_at: datetime
    updated_at: datetime


class SuperAdminUserCreateRequest(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class PlatformTenantCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$")
    default_locale: str = Field(default="en", min_length=2, max_length=16)
    tenant_admin_email: EmailStr
    tenant_admin_display_name: str | None = Field(default=None, max_length=255)
