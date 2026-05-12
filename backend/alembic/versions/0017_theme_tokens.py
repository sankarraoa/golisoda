"""Add theme tokens to survey templates + tenant branding.

Revision ID: 0017_theme_tokens
Revises: 0016_tpl_heritage_luxury

Notes:
- Default token values for default_stepper are sourced from frontend baseline CSS defaults:
  `frontend/src/styles/tokens.css` currently defines:
    --color-tenant-primary: #1a73e8;
    --color-tenant-secondary: #e8f0fe;
  These are mirrored here so token-driven theming is byte-identical by default.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0017_theme_tokens"
down_revision: str | None = "0016_tpl_heritage_luxury"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


DEFAULT_STEPPER_THEME = (
    '{"color.brand.primary":"#1a73e8","color.brand.secondary":"#e8f0fe"}'
)


def upgrade() -> None:
    op.add_column(
        "survey_templates",
        sa.Column(
            "theme",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "tenant_branding",
        sa.Column(
            "theme_overrides",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )

    conn = op.get_bind()
    # Backfill is implicit via NOT NULL + DEFAULT '{}', but keep idempotent updates explicit.
    conn.execute(sa.text("UPDATE survey_templates SET theme = '{}'::jsonb WHERE theme IS NULL"))
    conn.execute(sa.text("UPDATE tenant_branding SET theme_overrides = '{}'::jsonb WHERE theme_overrides IS NULL"))

    conn.execute(
        sa.text(
            "UPDATE survey_templates SET theme = CAST(:theme AS jsonb) WHERE slug = 'default_stepper'"
        ),
        {"theme": DEFAULT_STEPPER_THEME},
    )

    op.alter_column("survey_templates", "theme", server_default=sa.text("'{}'::jsonb"))
    op.alter_column("tenant_branding", "theme_overrides", server_default=sa.text("'{}'::jsonb"))


def downgrade() -> None:
    op.drop_column("tenant_branding", "theme_overrides")
    op.drop_column("survey_templates", "theme")

