from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UuidPrimaryKeyMixin
from app.models.enums import QueueStatus, enum_values


class FeedbackSubmissionQueue(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "feedback_submission_queue"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "channel_id",
            "idempotency_key_hash",
            name="uq_feedback_submission_queue_idempotency",
        ),
        Index("ix_feedback_submission_queue_status_next_attempt", "status", "next_attempt_at"),
        Index("ix_feedback_submission_queue_locked_until", "locked_until"),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("feedback_channels.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    survey_version_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("survey_versions.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    idempotency_key_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    status: Mapped[QueueStatus] = mapped_column(
        Enum(QueueStatus, name="queue_status", values_callable=enum_values),
        nullable=False,
        default=QueueStatus.PENDING,
        index=True,
    )
    attempt_count: Mapped[int] = mapped_column(nullable=False, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    locked_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class FeedbackSubmissionDeadLetter(UuidPrimaryKeyMixin, Base):
    __tablename__ = "feedback_submission_dead_letters"
    __table_args__ = (
        Index("ix_feedback_submission_dead_letters_tenant_created", "tenant_id", "created_at"),
        Index("ix_feedback_submission_dead_letters_error_class", "error_class"),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    queue_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    channel_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    survey_version_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    error_class: Mapped[str] = mapped_column(String(160), nullable=False)
    error_message: Mapped[str] = mapped_column(Text, nullable=False)
    attempt_count: Mapped[int] = mapped_column(nullable=False, default=0)
    request_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    metadata_json: Mapped[dict] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
