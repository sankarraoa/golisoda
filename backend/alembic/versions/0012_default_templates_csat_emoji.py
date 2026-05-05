"""Default stepper/single-page: CSAT emoji + thumbs binary (explicit renderers).

Revision ID: 0012_tpl_csat_emoji
Revises: 0011_text_phone_email
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0012_tpl_csat_emoji"
down_revision: str | None = "0011_text_phone_email"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

STEPPER_JSON = (
    '{"layout":"stepper","nps":{"presentation":"numeric"},'
    '"csat_5":{"renderer":"emoji_5"},"csat_4":{"renderer":"emoji_4"},"csat_2":{"renderer":"thumbs"},'
    '"progress":{"style":"bar"},"navigation":{"auto_advance":false},"touch":{"large_targets":false}}'
)

SINGLE_PAGE_JSON = (
    '{"layout":"single_page","nps":{"presentation":"numeric"},'
    '"csat_5":{"renderer":"emoji_5"},"csat_4":{"renderer":"emoji_4"},"csat_2":{"renderer":"thumbs"},'
    '"progress":{"style":"none"},"navigation":{"auto_advance":false},"touch":{"large_targets":false}}'
)

LEGACY_STEPPER = (
    '{"layout":"stepper","nps":{"presentation":"numeric"},"csat":{"presentation":"digits"},'
    '"progress":{"style":"bar"},"navigation":{"auto_advance":false},"touch":{"large_targets":false}}'
)

LEGACY_SINGLE = (
    '{"layout":"single_page","nps":{"presentation":"numeric"},"csat":{"presentation":"digits"},'
    '"progress":{"style":"none"},"navigation":{"auto_advance":false},"touch":{"large_targets":false}}'
)


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("UPDATE survey_templates SET presentation = CAST(:p AS jsonb) WHERE slug = 'default_stepper'"),
        {"p": STEPPER_JSON},
    )
    conn.execute(
        sa.text("UPDATE survey_templates SET presentation = CAST(:p AS jsonb) WHERE slug = 'single_page'"),
        {"p": SINGLE_PAGE_JSON},
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text("UPDATE survey_templates SET presentation = CAST(:p AS jsonb) WHERE slug = 'default_stepper'"),
        {"p": LEGACY_STEPPER},
    )
    conn.execute(
        sa.text("UPDATE survey_templates SET presentation = CAST(:p AS jsonb) WHERE slug = 'single_page'"),
        {"p": LEGACY_SINGLE},
    )
