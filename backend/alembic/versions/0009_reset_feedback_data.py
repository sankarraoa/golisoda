"""Wipe stale survey, channel, and response data (destructive).

Revision ID: 0009_reset_feedback_data
Revises: 0008_csat_scale
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_reset_feedback_data"
down_revision: str | None = "0008_csat_scale"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # Order respects FKs (RESTRICT on survey_versions from channels/responses/queue).
    statements = [
        "DELETE FROM response_answers",
        "DELETE FROM responses",
        "DELETE FROM feedback_submission_queue",
        "DELETE FROM feedback_submission_dead_letters",
        "DELETE FROM feedback_channels",
        "DELETE FROM question_options",
        # Orphan survey/question copy not tied to FKs
        "DELETE FROM translations WHERE entity_type IN ('survey', 'question')",
        "DELETE FROM questions",
        "DELETE FROM survey_versions",
        "DELETE FROM surveys",
    ]
    for sql in statements:
        conn.execute(sa.text(sql))


def downgrade() -> None:
    raise NotImplementedError("0009_reset_feedback_data cannot restore deleted rows.")
