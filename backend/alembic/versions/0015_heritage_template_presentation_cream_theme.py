"""Refresh heritage_immersive template presentation (emoji CSAT) and copy.

Revision ID: 0015_heritage_pres
Revises: 0014_tpl_heritage
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0015_heritage_pres"
down_revision: str | None = "0014_tpl_heritage"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

HERITAGE_PRESENTATION = (
    '{"layout":"single_page","nps":{"presentation":"numeric"},'
    '"csat_5":{"renderer":"emoji_5"},"csat_4":{"renderer":"emoji_4"},"csat_2":{"renderer":"emoji_2"},'
    '"progress":{"style":"none"},"navigation":{"auto_advance":false},"touch":{"large_targets":true}}'
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
            "presentation": HERITAGE_PRESENTATION,
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


def downgrade() -> None:
    legacy = (
        '{"layout":"single_page","nps":{"presentation":"numeric"},"csat_5":{"renderer":"stars"},'
        '"csat_4":{"renderer":"stars"},"csat_2":{"renderer":"emoji_2"},'
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
                "Full-screen concierge-style kiosk: tenant logo, glass question panel, and star ratings—"
                "ideal for jewellery, saree salons, hospitality, and premium retailers."
            ),
            "notes": (
                "Optimized for single-page surveys with CSAT stars. The look is built from CSS "
                "(gradients, glass panel, typography)—no default photo background. "
                "Use survey description for the footer tagline; add a tenant logo in branding for the header mark."
            ),
        },
    )
