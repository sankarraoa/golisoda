from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Enum, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UuidPrimaryKeyMixin
from app.models.enums import AuditAction, AuditActorType, AuditOutcome, enum_values


class AuditLog(UuidPrimaryKeyMixin, Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_occurred_at", "occurred_at"),
        Index("ix_audit_logs_tenant_id_occurred_at", "tenant_id", "occurred_at"),
        Index("ix_audit_logs_request_id", "request_id"),
        Index("ix_audit_logs_action_occurred_at", "action", "occurred_at"),
    )

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    actor_type: Mapped[AuditActorType] = mapped_column(
        Enum(AuditActorType, name="audit_actor_type", values_callable=enum_values),
        nullable=False,
    )
    actor_id: Mapped[str] = mapped_column(Text, nullable=False)
    tenant_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    action: Mapped[AuditAction] = mapped_column(
        Enum(AuditAction, name="audit_action", values_callable=enum_values),
        nullable=False,
    )
    resource_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    outcome: Mapped[AuditOutcome] = mapped_column(
        Enum(AuditOutcome, name="audit_outcome", values_callable=enum_values),
        nullable=False,
    )
    request_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    metadata_json: Mapped[dict] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
