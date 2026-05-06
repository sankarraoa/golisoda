"""Add heritage_immersive survey template (luxury kiosk / retail).

Revision ID: 0014_tpl_heritage
Revises: 0013_repair_q_types
"""

from collections.abc import Sequence
from uuid import UUID

import sqlalchemy as sa

from alembic import op

revision: str = "0014_tpl_heritage"
down_revision: str | None = "0013_repair_q_types"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TEMPLATE_HERITAGE_IMMERSIVE = UUID("f0000004-0000-4000-a000-000000000004")

HERITAGE_PRESENTATION = """{"layout":"single_page","nps":{"presentation":"numeric"},"csat_5":{"renderer":"stars"},"csat_4":{"renderer":"stars"},"csat_2":{"renderer":"emoji_2"},"progress":{"style":"none"},"navigation":{"auto_advance":false},"touch":{"large_targets":true}}"""


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            INSERT INTO survey_templates
              (id, slug, name, description, deployment_notes, presentation, sort_order, is_active)
            VALUES
              (:id, :slug, :name, :description, :notes, CAST(:presentation AS JSONB), :sort_order, true)
            ON CONFLICT (slug) DO NOTHING
            """
        ),
        {
            "id": str(TEMPLATE_HERITAGE_IMMERSIVE),
            "slug": "heritage_immersive",
            "name": "Heritage immersive",
            "description": (
                "Full-screen concierge-style kiosk: tenant logo, glass question panel, and star ratings—"
                "ideal for jewellery, saree salons, hospitality, and premium retailers."
            ),
            "notes": (
                "Optimized for single-page surveys with CSAT stars. Uses an ambient art layer; "
                "replace /feedback-theme/heritage-ambient.png in the app for bespoke brand imagery."
            ),
            "presentation": HERITAGE_PRESENTATION,
            "sort_order": 25,
        },
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM survey_templates WHERE slug = 'heritage_immersive'"))
