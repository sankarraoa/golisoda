"""Kiosk template: disable auto-advance and use numeric NPS row.

Revision ID: 0010_kiosk_navigation
Revises: 0009_reset_feedback_data
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010_kiosk_navigation"
down_revision: str | None = "0009_reset_feedback_data"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE survey_templates
            SET presentation = jsonb_set(
                jsonb_set(
                    presentation::jsonb,
                    '{navigation,auto_advance}',
                    'false'::jsonb,
                    true
                ),
                '{nps}',
                '{"presentation":"numeric"}'::jsonb,
                true
            )
            WHERE slug = 'kiosk_touch'
            """
        )
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE survey_templates
            SET presentation = jsonb_set(
                jsonb_set(
                    presentation::jsonb,
                    '{navigation,auto_advance}',
                    'true'::jsonb,
                    true
                ),
                '{nps}',
                '{"presentation":"segmented"}'::jsonb,
                true
            )
            WHERE slug = 'kiosk_touch'
            """
        )
    )
