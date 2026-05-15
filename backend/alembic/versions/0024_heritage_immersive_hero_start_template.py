"""Add heritage_immersive_hero_start (hero column on start / left via package.

Revision ID: 0024_heritage_hero_start
Revises: 0023_heritage_stepper
"""

from collections.abc import Sequence
from uuid import UUID

import sqlalchemy as sa

from alembic import op

revision: str = "0024_heritage_hero_start"
down_revision: str | None = "0023_heritage_stepper"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TEMPLATE_ID = UUID("f0000004-0000-4000-a000-000000000025")

PRESENTATION = (
    '{"layout":"stepper","nps":{"presentation":"numeric"},'
    '"csat_5":{"renderer":"stars"},"csat_4":{"renderer":"stars"},"csat_2":{"renderer":"yes_no"},'
    '"progress":{"style":"dots"},"navigation":{"auto_advance":false},"touch":{"large_targets":true},'
    '"package":{"immersive":{"hero_column":"start","hero_asset_paths":[]}}}'
)


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
            "id": str(TEMPLATE_ID),
            "slug": "heritage_immersive_hero_start",
            "name": "Heritage immersive (hero leading)",
            "description": (
                "Same mint / ivory heritage chrome as Heritage immersive, but the hero portrait column "
                "is driven by template config: `presentation.package.immersive.hero_column` is `start` "
                "(leading column in LTR). Optional `hero_asset_paths` lists images under an imported pack."
            ),
            "notes": (
                "Stepper + dot progress. Use sibling template `heritage_immersive` for hero on the end (right). "
                "To use pack-served heroes, import a ZIP with images under assets/ and list paths in "
                "hero_asset_paths (e.g. [\"images/hero-a.png\"])."
            ),
            "presentation": PRESENTATION,
            "sort_order": 26,
        },
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM survey_templates WHERE slug = 'heritage_immersive_hero_start'"))
