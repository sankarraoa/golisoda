"""survey_templates global catalog + channel FK

Revision ID: 0007_survey_templates
Revises: 0006_qtype_rating
Create Date: 2026-05-05

"""

from collections.abc import Sequence
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# Keep revision id ≤ 32 chars (alembic_version.version_num is VARCHAR(32))
revision: str = "0007_survey_templates"
down_revision: str | None = "0006_qtype_rating"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TEMPLATE_DEFAULT_STEPPER = UUID("f0000001-0000-4000-a000-000000000001")
TEMPLATE_SINGLE_PAGE = UUID("f0000002-0000-4000-a000-000000000002")
TEMPLATE_KIOSK_TOUCH = UUID("f0000003-0000-4000-a000-000000000003")

PRESENTATION_DEFAULT = """{
  "layout": "stepper",
  "nps": {"presentation": "numeric"},
  "csat": {"presentation": "digits"},
  "progress": {"style": "bar"},
  "navigation": {"auto_advance": false},
  "touch": {"large_targets": false}
}"""

PRESENTATION_SINGLE_PAGE = """{
  "layout": "single_page",
  "nps": {"presentation": "numeric"},
  "csat": {"presentation": "digits"},
  "progress": {"style": "none"},
  "navigation": {"auto_advance": false},
  "touch": {"large_targets": false}
}"""

PRESENTATION_KIOSK = """{
  "layout": "stepper",
  "nps": {"presentation": "numeric"},
  "csat_5": {"renderer": "emoji_5"},
  "csat_4": {"renderer": "emoji_4"},
  "csat_2": {"renderer": "emoji_2"},
  "progress": {"style": "dots"},
  "navigation": {"auto_advance": false},
  "touch": {"large_targets": true}
}"""


def upgrade() -> None:
    op.create_table(
        "survey_templates",
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("deployment_notes", sa.Text(), nullable=True),
        sa.Column("presentation", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_survey_templates")),
        sa.UniqueConstraint("slug", name="uq_survey_templates_slug"),
    )
    op.create_index(op.f("ix_survey_templates_slug"), "survey_templates", ["slug"], unique=True)

    conn = op.get_bind()
    for template_id, slug, name, desc, notes, presentation, sort_order in [
        (
            TEMPLATE_DEFAULT_STEPPER,
            "default_stepper",
            "Stepper (default)",
            "One question per screen with a progress bar—the standard mobile-friendly flow.",
            "Best for QR codes and SMS links where customers answer on their phone.",
            PRESENTATION_DEFAULT,
            0,
        ),
        (
            TEMPLATE_SINGLE_PAGE,
            "single_page",
            "Single page",
            "All questions on one scrollable form without step transitions.",
            "Useful for shorter surveys or when you want a form-like layout.",
            PRESENTATION_SINGLE_PAGE,
            10,
        ),
        (
            TEMPLATE_KIOSK_TOUCH,
            "kiosk_touch",
            "Kiosk / touch",
            "Larger controls, segmented NPS styling, dotted progress—optimized for kiosk displays.",
            "Deploy on tablets at counter or wall-mounted kiosk mode (?kiosk=1).",
            PRESENTATION_KIOSK,
            20,
        ),
    ]:
        conn.execute(
            sa.text(
                """
                INSERT INTO survey_templates
                  (id, slug, name, description, deployment_notes, presentation, sort_order, is_active)
                VALUES
                  (:id, :slug, :name, :description, :notes, CAST(:presentation AS JSONB), :sort_order, true)
                """
            ),
            {
                "id": template_id,
                "slug": slug,
                "name": name,
                "description": desc,
                "notes": notes,
                "presentation": presentation,
                "sort_order": sort_order,
            },
        )

    op.add_column(
        "feedback_channels",
        sa.Column(
            "survey_template_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.execute(
        sa.text(
            "UPDATE feedback_channels SET survey_template_id = CAST(:tid AS UUID) WHERE survey_template_id IS NULL"
        ).bindparams(tid=str(TEMPLATE_DEFAULT_STEPPER)),
    )
    op.alter_column(
        "feedback_channels",
        "survey_template_id",
        nullable=False,
        server_default=sa.text(f"'{TEMPLATE_DEFAULT_STEPPER}'::uuid"),
    )
    op.create_foreign_key(
        op.f("fk_feedback_channels_survey_template_id_survey_templates"),
        "feedback_channels",
        "survey_templates",
        ["survey_template_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        op.f("ix_feedback_channels_survey_template_id"),
        "feedback_channels",
        ["survey_template_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_feedback_channels_survey_template_id"), table_name="feedback_channels")
    op.drop_constraint(
        op.f("fk_feedback_channels_survey_template_id_survey_templates"),
        "feedback_channels",
        type_="foreignkey",
    )
    op.drop_column("feedback_channels", "survey_template_id")
    op.drop_index(op.f("ix_survey_templates_slug"), table_name="survey_templates")
    op.drop_table("survey_templates")
