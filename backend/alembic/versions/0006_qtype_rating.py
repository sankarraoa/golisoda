"""extend question_type for CSAT variants and emoji scales

Revision ID: 0006_qtype_rating
Revises: 0005_granular_rbac
Create Date: 2026-05-05

"""
from collections.abc import Sequence

from alembic import op

# Keep revision id ≤ 32 chars (alembic_version.version_num is VARCHAR(32))
revision: str = "0006_qtype_rating"
down_revision: str | None = "0005_granular_rbac"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_QUESTION_TYPES = [
    "csat_2",
    "emoji_rating_5",
    "emoji_rating_4",
    "emoji_rating_2",
    "thumbs",
]


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for value in NEW_QUESTION_TYPES:
            op.execute(f"ALTER TYPE question_type ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    pass
