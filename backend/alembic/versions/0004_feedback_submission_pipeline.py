"""feedback submission pipeline

Revision ID: 0004_feedback_submit
Revises: 0003_channel_foundation
Create Date: 2026-05-05

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0004_feedback_submit"
down_revision: str | None = "0003_channel_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_foreign_key(
        op.f("fk_feedback_submission_queue_channel_id_feedback_channels"),
        "feedback_submission_queue",
        "feedback_channels",
        ["channel_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        op.f("fk_feedback_submission_queue_survey_version_id_survey_versions"),
        "feedback_submission_queue",
        "survey_versions",
        ["survey_version_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.create_table(
        "responses",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("channel_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("survey_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("idempotency_key_hash", sa.String(length=128), nullable=False),
        sa.Column("locale", sa.String(length=16), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["channel_id"], ["feedback_channels.id"], name=op.f("fk_responses_channel_id_feedback_channels"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], name=op.f("fk_responses_location_id_locations"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["survey_version_id"], ["survey_versions.id"], name=op.f("fk_responses_survey_version_id_survey_versions"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name=op.f("fk_responses_tenant_id_tenants"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_responses")),
        sa.UniqueConstraint("tenant_id", "channel_id", "idempotency_key_hash", name="uq_responses_idempotency"),
    )
    op.create_index(op.f("ix_responses_channel_id"), "responses", ["channel_id"])
    op.create_index("ix_responses_channel_submitted", "responses", ["channel_id", "submitted_at"])
    op.create_index(op.f("ix_responses_location_id"), "responses", ["location_id"])
    op.create_index("ix_responses_location_submitted", "responses", ["location_id", "submitted_at"])
    op.create_index(op.f("ix_responses_survey_version_id"), "responses", ["survey_version_id"])
    op.create_index(op.f("ix_responses_tenant_id"), "responses", ["tenant_id"])
    op.create_index(
        "ix_responses_tenant_survey_submitted",
        "responses",
        ["tenant_id", "survey_version_id", "submitted_at"],
    )

    op.create_table(
        "response_answers",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("response_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_key", sa.String(length=120), nullable=False),
        sa.Column("question_type", sa.String(length=80), nullable=False),
        sa.Column("raw_value", sa.Text(), nullable=False),
        sa.Column("value_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_pii", sa.Boolean(), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["response_id"], ["responses.id"], name=op.f("fk_response_answers_response_id_responses"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name=op.f("fk_response_answers_tenant_id_tenants"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_response_answers")),
        sa.UniqueConstraint("response_id", "question_key", name="uq_response_answers_question"),
    )
    op.create_index(op.f("ix_response_answers_response_id"), "response_answers", ["response_id"])
    op.create_index(op.f("ix_response_answers_tenant_id"), "response_answers", ["tenant_id"])
    op.create_index(
        "ix_response_answers_tenant_question",
        "response_answers",
        ["tenant_id", "question_key"],
    )


def downgrade() -> None:
    op.drop_table("response_answers")
    op.drop_table("responses")
    op.drop_constraint(
        op.f("fk_feedback_submission_queue_survey_version_id_survey_versions"),
        "feedback_submission_queue",
        type_="foreignkey",
    )
    op.drop_constraint(
        op.f("fk_feedback_submission_queue_channel_id_feedback_channels"),
        "feedback_submission_queue",
        type_="foreignkey",
    )
