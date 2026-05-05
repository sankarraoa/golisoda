from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UuidPrimaryKeyMixin


class Response(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "responses"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "channel_id",
            "idempotency_key_hash",
            name="uq_responses_idempotency",
        ),
        Index(
            "ix_responses_tenant_survey_submitted",
            "tenant_id",
            "survey_version_id",
            "submitted_at",
        ),
        Index("ix_responses_location_submitted", "location_id", "submitted_at"),
        Index("ix_responses_channel_submitted", "channel_id", "submitted_at"),
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
    location_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="CASCADE"),
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
    locale: Mapped[str] = mapped_column(String(16), nullable=False, default="en")
    submitted_at: Mapped[datetime] = mapped_column(
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

    answers: Mapped[list["ResponseAnswer"]] = relationship(
        back_populates="response",
        cascade="all, delete-orphan",
    )


class ResponseAnswer(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "response_answers"
    __table_args__ = (
        UniqueConstraint("response_id", "question_key", name="uq_response_answers_question"),
        Index("ix_response_answers_tenant_question", "tenant_id", "question_key"),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    response_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("responses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_key: Mapped[str] = mapped_column(String(120), nullable=False)
    question_type: Mapped[str] = mapped_column(String(80), nullable=False)
    raw_value: Mapped[str] = mapped_column(Text, nullable=False)
    value_json: Mapped[dict | list | str | int | float | bool | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    is_pii: Mapped[bool] = mapped_column(nullable=False, default=False)

    response: Mapped[Response] = relationship(back_populates="answers")
