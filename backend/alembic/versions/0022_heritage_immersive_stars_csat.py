"""Heritage immersive: CSAT stars + yes/no (luxury defaults).

Revision ID: 0022_heritage_stars
Revises: 0021_heritage_immersive_step
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0022_heritage_stars"
down_revision: str | None = "0021_heritage_immersive_step"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PRESENTATION = (
    '{"layout":"stepper","nps":{"presentation":"numeric"},'
    '"csat_5":{"renderer":"stars"},"csat_4":{"renderer":"stars"},"csat_2":{"renderer":"yes_no"},'
    '"progress":{"style":"dots"},"navigation":{"auto_advance":false},"touch":{"large_targets":true}}'
)

PRIOR_PRESENTATION = (
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
                "question column with star-scale CSAT and square NPS tiles, hero portrait on the right, "
                "and yes / no binary prompts where applicable."
            ),
            "notes": (
                "Stepper with dot progress; questions in the first column, hero in the second. "
                "Default CSAT renderers: stars (5 & 4), yes/no (binary). Tenant address lines in the header when available."
            ),
        },
    )


def downgrade() -> None:
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
            "presentation": PRIOR_PRESENTATION,
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
