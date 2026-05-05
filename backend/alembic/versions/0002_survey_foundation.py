"""survey foundation

Revision ID: 0002_survey_foundation
Revises: 0001_foundation_schema
Create Date: 2026-05-05

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002_survey_foundation"
down_revision: str | None = "0001_foundation_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


survey_status = postgresql.ENUM(
    "draft",
    "published",
    "archived",
    name="survey_status",
    create_type=False,
)
survey_version_status = postgresql.ENUM(
    "published",
    "archived",
    name="survey_version_status",
    create_type=False,
)
question_type = postgresql.ENUM(
    "nps",
    "csat",
    "single_selection",
    "multi_selection",
    "plain_text",
    "dropdown",
    name="question_type",
    create_type=False,
)


def upgrade() -> None:
    op.execute("ALTER TYPE permission_code ADD VALUE IF NOT EXISTS 'survey:create'")
    op.execute("ALTER TYPE permission_code ADD VALUE IF NOT EXISTS 'survey:read'")
    op.execute("ALTER TYPE permission_code ADD VALUE IF NOT EXISTS 'survey:update'")
    op.execute("ALTER TYPE permission_code ADD VALUE IF NOT EXISTS 'survey:publish'")

    survey_status.create(op.get_bind(), checkfirst=True)
    survey_version_status.create(op.get_bind(), checkfirst=True)
    question_type.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "surveys",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("default_locale", sa.String(length=16), nullable=False),
        sa.Column("status", survey_status, nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name=op.f("fk_surveys_tenant_id_tenants"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_surveys")),
        sa.UniqueConstraint("tenant_id", "slug", name="uq_surveys_tenant_id_slug"),
    )
    op.create_index(op.f("ix_surveys_tenant_id"), "surveys", ["tenant_id"])
    op.create_index("ix_surveys_tenant_status", "surveys", ["tenant_id", "status"])

    op.create_table(
        "survey_versions",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("survey_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("status", survey_version_status, nullable=False),
        sa.Column("schema_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["survey_id"], ["surveys.id"], name=op.f("fk_survey_versions_survey_id_surveys"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name=op.f("fk_survey_versions_tenant_id_tenants"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_survey_versions")),
        sa.UniqueConstraint("survey_id", "version_number", name="uq_survey_versions_survey_version"),
    )
    op.create_index(op.f("ix_survey_versions_survey_id"), "survey_versions", ["survey_id"])
    op.create_index(op.f("ix_survey_versions_tenant_id"), "survey_versions", ["tenant_id"])
    op.create_index("ix_survey_versions_tenant_survey", "survey_versions", ["tenant_id", "survey_id"])

    op.create_table(
        "questions",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("survey_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_key", sa.String(length=120), nullable=False),
        sa.Column("question_type", question_type, nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("help_text", sa.Text(), nullable=True),
        sa.Column("is_required", sa.Boolean(), nullable=False),
        sa.Column("is_pii", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("branching_metadata", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["survey_id"], ["surveys.id"], name=op.f("fk_questions_survey_id_surveys"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name=op.f("fk_questions_tenant_id_tenants"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_questions")),
        sa.UniqueConstraint("survey_id", "question_key", name="uq_questions_survey_question_key"),
    )
    op.create_index(op.f("ix_questions_survey_id"), "questions", ["survey_id"])
    op.create_index(op.f("ix_questions_tenant_id"), "questions", ["tenant_id"])
    op.create_index("ix_questions_tenant_survey_order", "questions", ["tenant_id", "survey_id", "sort_order"])

    op.create_table(
        "question_options",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("value", sa.String(length=120), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], name=op.f("fk_question_options_question_id_questions"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name=op.f("fk_question_options_tenant_id_tenants"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_question_options")),
        sa.UniqueConstraint("question_id", "value", name="uq_question_options_question_value"),
    )
    op.create_index(op.f("ix_question_options_question_id"), "question_options", ["question_id"])
    op.create_index(op.f("ix_question_options_tenant_id"), "question_options", ["tenant_id"])
    op.create_index("ix_question_options_tenant_question_order", "question_options", ["tenant_id", "question_id", "sort_order"])

    op.create_table(
        "translations",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_type", sa.String(length=80), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("locale", sa.String(length=16), nullable=False),
        sa.Column("field_name", sa.String(length=80), nullable=False),
        sa.Column("translated_value", sa.Text(), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name=op.f("fk_translations_tenant_id_tenants"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_translations")),
        sa.UniqueConstraint("tenant_id", "entity_type", "entity_id", "locale", "field_name", name="uq_translations_entity_locale_field"),
    )
    op.create_index(op.f("ix_translations_tenant_id"), "translations", ["tenant_id"])
    op.create_index("ix_translations_lookup", "translations", ["entity_type", "entity_id", "locale"])


def downgrade() -> None:
    op.drop_table("translations")
    op.drop_table("question_options")
    op.drop_table("questions")
    op.drop_table("survey_versions")
    op.drop_table("surveys")

    question_type.drop(op.get_bind(), checkfirst=True)
    survey_version_status.drop(op.get_bind(), checkfirst=True)
    survey_status.drop(op.get_bind(), checkfirst=True)
