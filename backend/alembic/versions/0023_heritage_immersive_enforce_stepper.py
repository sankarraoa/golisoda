"""Ensure heritage_immersive uses stepper + dot progress (per-step hero rotation).

Revision ID: 0023_heritage_stepper
Revises: 0022_heritage_stars
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0023_heritage_stepper"
down_revision: str | None = "0022_heritage_stars"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE survey_templates
        SET presentation = jsonb_set(
          jsonb_set(presentation::jsonb, '{layout}', '"stepper"', true),
          '{progress,style}', '"dots"', true
        )
        WHERE slug = 'heritage_immersive'
        """
    )


def downgrade() -> None:
    pass
