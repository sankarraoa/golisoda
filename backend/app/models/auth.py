from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UuidPrimaryKeyMixin
from app.models.enums import BindingScope, PermissionCode, UserStatus, enum_values


class User(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_users_tenant_id_email"),
        Index("ix_users_tenant_id_status", "tenant_id", "status"),
    )

    tenant_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone_ciphertext: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus, name="user_status", values_callable=enum_values),
        nullable=False,
        default=UserStatus.ACTIVE,
    )
    token_version: Mapped[int] = mapped_column(nullable=False, default=1)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    role_bindings: Mapped[list["UserRoleBinding"]] = relationship(back_populates="user")


class Role(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("tenant_id", "code", name="uq_roles_tenant_id_code"),)

    tenant_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(nullable=False, default=False)

    permissions: Mapped[list["RolePermission"]] = relationship(
        back_populates="role",
        cascade="all, delete-orphan",
    )
    user_bindings: Mapped[list["UserRoleBinding"]] = relationship(back_populates="role")


class Permission(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "permissions"
    __table_args__ = (UniqueConstraint("code", name="uq_permissions_code"),)

    code: Mapped[PermissionCode] = mapped_column(
        Enum(PermissionCode, name="permission_code", values_callable=enum_values),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    roles: Mapped[list["RolePermission"]] = relationship(back_populates="permission")


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_role_permissions_role_permission"),
    )

    role_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    permission_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("permissions.id", ondelete="CASCADE"),
        primary_key=True,
    )

    role: Mapped[Role] = relationship(back_populates="permissions")
    permission: Mapped[Permission] = relationship(back_populates="roles")


class UserRoleBinding(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_role_bindings"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "role_id",
            "scope",
            "tenant_id",
            "location_id",
            name="uq_user_role_bindings_scope",
        ),
        Index("ix_user_role_bindings_tenant_location", "tenant_id", "location_id"),
    )

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scope: Mapped[BindingScope] = mapped_column(
        Enum(BindingScope, name="binding_scope", values_callable=enum_values),
        nullable=False,
    )
    tenant_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    location_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    user: Mapped[User] = relationship(back_populates="role_bindings")
    role: Mapped[Role] = relationship(back_populates="user_bindings")
