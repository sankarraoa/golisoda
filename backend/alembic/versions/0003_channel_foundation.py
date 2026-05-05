"""channel foundation

Revision ID: 0003_channel_foundation
Revises: 0002_survey_foundation
Create Date: 2026-05-05

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0003_channel_foundation"
down_revision: str | None = "0002_survey_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

channel_status = postgresql.ENUM(
    "active",
    "disabled",
    name="channel_status",
    create_type=False,
)
channel_type = postgresql.ENUM(
    "qr",
    "kiosk",
    name="channel_type",
    create_type=False,
)


def upgrade() -> None:
    op.execute("ALTER TYPE permission_code ADD VALUE IF NOT EXISTS 'channel:create'")
    op.execute("ALTER TYPE permission_code ADD VALUE IF NOT EXISTS 'channel:read'")
    op.execute("ALTER TYPE permission_code ADD VALUE IF NOT EXISTS 'channel:update'")

    channel_status.create(op.get_bind(), checkfirst=True)
    channel_type.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "feedback_channels",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("survey_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("channel_code", sa.String(length=32), nullable=False),
        sa.Column("channel_type", channel_type, nullable=False),
        sa.Column("status", channel_status, nullable=False),
        sa.Column("qr_url", sa.Text(), nullable=True),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["location_id"],
            ["locations.id"],
            name=op.f("fk_feedback_channels_location_id_locations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["survey_version_id"],
            ["survey_versions.id"],
            name=op.f("fk_feedback_channels_survey_version_id_survey_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name=op.f("fk_feedback_channels_tenant_id_tenants"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_feedback_channels")),
        sa.UniqueConstraint("channel_code", name="uq_feedback_channels_channel_code"),
        sa.UniqueConstraint("tenant_id", "name", name="uq_feedback_channels_tenant_name"),
    )
    op.create_index(
        op.f("ix_feedback_channels_channel_code"),
        "feedback_channels",
        ["channel_code"],
        unique=True,
    )
    op.create_index(op.f("ix_feedback_channels_location_id"), "feedback_channels", ["location_id"])
    op.create_index(
        op.f("ix_feedback_channels_survey_version_id"),
        "feedback_channels",
        ["survey_version_id"],
    )
    op.create_index(op.f("ix_feedback_channels_tenant_id"), "feedback_channels", ["tenant_id"])
    op.create_index(
        "ix_feedback_channels_tenant_location",
        "feedback_channels",
        ["tenant_id", "location_id"],
    )
    op.create_index(
        "ix_feedback_channels_tenant_status",
        "feedback_channels",
        ["tenant_id", "status"],
    )


def downgrade() -> None:
    op.drop_table("feedback_channels")
    channel_type.drop(op.get_bind(), checkfirst=True)
    channel_status.drop(op.get_bind(), checkfirst=True)
