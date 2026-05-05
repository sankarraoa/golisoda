from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UuidPrimaryKeyMixin
from app.models.enums import (
    QuestionType,
    SurveyStatus,
    SurveyVersionStatus,
    enum_values,
)


class Survey(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "surveys"
    __table_args__ = (
        UniqueConstraint("tenant_id", "slug", name="uq_surveys_tenant_id_slug"),
        Index("ix_surveys_tenant_status", "tenant_id", "status"),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_user_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_locale: Mapped[str] = mapped_column(String(16), nullable=False, default="en")
    status: Mapped[SurveyStatus] = mapped_column(
        Enum(SurveyStatus, name="survey_status", values_callable=enum_values),
        nullable=False,
        default=SurveyStatus.DRAFT,
    )

    questions: Mapped[list["Question"]] = relationship(
        back_populates="survey",
        cascade="all, delete-orphan",
    )
    versions: Mapped[list["SurveyVersion"]] = relationship(back_populates="survey")


class SurveyVersion(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "survey_versions"
    __table_args__ = (
        UniqueConstraint("survey_id", "version_number", name="uq_survey_versions_survey_version"),
        Index("ix_survey_versions_tenant_survey", "tenant_id", "survey_id"),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    survey_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("surveys.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[SurveyVersionStatus] = mapped_column(
        Enum(SurveyVersionStatus, name="survey_version_status", values_callable=enum_values),
        nullable=False,
        default=SurveyVersionStatus.PUBLISHED,
    )
    schema_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    published_by_user_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)

    survey: Mapped[Survey] = relationship(back_populates="versions")


class Question(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "questions"
    __table_args__ = (
        UniqueConstraint("survey_id", "question_key", name="uq_questions_survey_question_key"),
        Index("ix_questions_tenant_survey_order", "tenant_id", "survey_id", "sort_order"),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    survey_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("surveys.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_key: Mapped[str] = mapped_column(String(120), nullable=False)
    question_type: Mapped[QuestionType] = mapped_column(
        Enum(QuestionType, name="question_type", values_callable=enum_values),
        nullable=False,
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    help_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_required: Mapped[bool] = mapped_column(nullable=False, default=True)
    is_pii: Mapped[bool] = mapped_column(nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0)
    branching_metadata: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )

    survey: Mapped[Survey] = relationship(back_populates="questions")
    options: Mapped[list["QuestionOption"]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
    )


class QuestionOption(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "question_options"
    __table_args__ = (
        UniqueConstraint("question_id", "value", name="uq_question_options_question_value"),
        Index(
            "ix_question_options_tenant_question_order",
            "tenant_id",
            "question_id",
            "sort_order",
        ),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    value: Mapped[str] = mapped_column(String(120), nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0)

    question: Mapped[Question] = relationship(back_populates="options")


class Translation(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "translations"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "entity_type",
            "entity_id",
            "locale",
            "field_name",
            name="uq_translations_entity_locale_field",
        ),
        Index("ix_translations_lookup", "entity_type", "entity_id", "locale"),
    )

    tenant_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    locale: Mapped[str] = mapped_column(String(16), nullable=False)
    field_name: Mapped[str] = mapped_column(String(80), nullable=False)
    translated_value: Mapped[str] = mapped_column(Text, nullable=False)
