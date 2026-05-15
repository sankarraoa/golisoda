"""Heritage immersive: stepper + dots for hero two-column layout.

Revision ID: 0021_heritage_immersive_step
Revises: 0020_phone_portrait_tpl
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0021_heritage_immersive_step"
down_revision: str | None = "0020_phone_portrait_tpl"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Stepper + dot progress — one question in column 2 beside hero image.
PRESENTATION = (
    '{"layout":"stepper","nps":{"presentation":"numeric"},'
    '"csat_5":{"renderer":"emoji_5"},"csat_4":{"renderer":"emoji_4"},"csat_2":{"renderer":"emoji_2"},'
    '"progress":{"style":"dots"},"navigation":{"auto_advance":false},"touch":{"large_targets":true}}'
)


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE survey_templates
              SET presentation = CAST(:presentation AS JSONB),
                  description = :description,
                  deployment_notes = :notes
              WHERE slug = 'heritage_immersive'
              """
        ),
        {
            "presentation": PRESENTATION,
            "description": (
                "Mint-aqua silk palette with ivory and champagne gold: top bar (logo + address), "
                "hero portrait and question column, and clear navigation. Emoji CSAT by default."
            ),
            "notes": (
                "Stepper with dot progress; one question per step beside the heritage hero image. "
                "Requires tenant address lines for the header when possible; falls back to location name."
            ),
        },
    )


def downgrade() -> None:
    legacy = (
        '{"layout":"single_page","nps":{"presentation":"numeric"},'
        '"csat_5":{"renderer":"emoji_5"},"csat_4":{"renderer":"emoji_4"},"csat_2":{"renderer":"emoji_2"},'
        '"progress":{"style":"none"},"navigation":{"auto_advance":false},"touch":{"large_targets":true}}'
    )
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE survey_templates
              SET presentation = CAST(:presentation AS JSONB),
                  description = :description,
                  deployment_notes = :notes
              WHERE slug = 'heritage_immersive'
              """
        ),
        {
            "presentation": legacy,
            "description": (
                "Cream sheet, maroon crown and floor band, gold filigree cues, and serif headlines—built for jewellery, saree "
                "salons, and hospitality flows. Emoji CSAT by default."
            ),
            "notes": (
                "Optimized for single-page surveys. Face-scale CSAT (emoji) matches premium retail mocks; admins can swap "
                "to stars via presentation overrides. Palette is CSS (cream/maroon/gold)—optional tenant logo replaces the generic "
                "temple motif in the crown. Uses survey.description as the ornamental footer tagline."
            ),
        },
    )
