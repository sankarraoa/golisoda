from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UuidPrimaryKeyMixin
from app.models.enums import TenantStatus, enum_values


class Tenant(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    default_locale: Mapped[str] = mapped_column(String(16), nullable=False, default="en")
    status: Mapped[TenantStatus] = mapped_column(
        Enum(TenantStatus, name="tenant_status", values_callable=enum_values),
        nullable=False,
        default=TenantStatus.ACTIVE,
    )
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    offboarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    address_line1: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address_city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    address_state: Mapped[str | None] = mapped_column(String(120), nullable=True)
    address_postal_code: Mapped[str | None] = mapped_column(String(32), nullable=True)

    branding: Mapped["TenantBranding"] = relationship(
        back_populates="tenant",
        cascade="all, delete-orphan",
    )
    locations: Mapped[list["Location"]] = relationship(back_populates="tenant")


class TenantBranding(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tenant_branding"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_tenant_branding_tenant_id"),)

    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    primary_color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    secondary_color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    theme_overrides: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    thank_you_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="Thank you for your feedback.",
    )

    tenant: Mapped[Tenant] = relationship(back_populates="branding")


class Location(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "locations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_locations_tenant_id_code"),
        Index("ix_locations_tenant_id_city", "tenant_id", "city"),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str] = mapped_column(String(80), nullable=False)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    region: Mapped[str | None] = mapped_column(String(120), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)

    tenant: Mapped[Tenant] = relationship(back_populates="locations")
