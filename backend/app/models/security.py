from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UuidPrimaryKeyMixin


class PiiKeyRegistry(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "pii_key_registry"
    __table_args__ = (
        UniqueConstraint("tenant_id", "key_version", name="uq_pii_key_registry_tenant_version"),
        Index("ix_pii_key_registry_tenant_active", "tenant_id", "retired_at"),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    key_version: Mapped[int] = mapped_column(nullable=False)
    encrypted_dek: Mapped[str] = mapped_column(nullable=False)
    encryption_context: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
