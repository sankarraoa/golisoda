"""Add short_text, phone, email question types.

Revision ID: 0011_text_phone_email
Revises: 0010_kiosk_navigation
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0011_text_phone_email"
down_revision: str | None = "0010_kiosk_navigation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for value in ("short_text", "phone", "email"):
            op.execute(sa.text(f"ALTER TYPE question_type ADD VALUE IF NOT EXISTS '{value}'"))


def downgrade() -> None:
    raise NotImplementedError("PostgreSQL cannot drop enum values safely here.")
