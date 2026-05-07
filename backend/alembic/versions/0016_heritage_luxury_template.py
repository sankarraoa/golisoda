"""Add heritage_luxury survey template (dual-column glass panel + hero).

Revision ID: 0016_tpl_heritage_luxury
Revises: 0015_heritage_pres
"""

from collections.abc import Sequence
from uuid import UUID

import sqlalchemy as sa

from alembic import op

revision: str = "0016_tpl_heritage_luxury"
down_revision: str | None = "0015_heritage_pres"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TEMPLATE_HERITAGE_LUXURY = UUID("f0000005-0000-4000-a000-000000000005")

PRESENTATION = (
    '{"layout":"single_page","nps":{"presentation":"numeric"},"csat_5":{"renderer":"stars"},'
    '"csat_4":{"renderer":"stars"},"csat_2":{"renderer":"emoji_2"},'
    '"progress":{"style":"none"},"navigation":{"auto_advance":false},"touch":{"large_targets":true}}'
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
            "id": str(TEMPLATE_HERITAGE_LUXURY),
            "slug": "heritage_luxury",
            "name": "Heritage luxury (dual)",
            "description": (
                "Premium boutique layout: ornate rose-gold frame, glass questionnaire panel beside a tall hero portrait. "
                "Gold star CSAT, maroon serif headings, metallic submit control—ideal for jewellery and couture retail."
            ),
            "notes": (
                "Hero image ships as /feedback-theme/heritage-luxury-hero.png (replace for your brand model). "
                "Uses survey.description as the small closing line under Submit (default: “Thank you!”). "
                "Playfair Display loads from Google Fonts for headings."
            ),
            "presentation": PRESENTATION,
            "sort_order": 30,
        },
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM survey_templates WHERE slug = 'heritage_luxury'"))
