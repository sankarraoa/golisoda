"""Repair legacy question_type strings left in DB after 0008 (csat → csat_5, etc.)

Revision ID: 0013_repair_q_types
Revises: 0012_default_templates_csat_emoji

Idempotent UPDATEs safe to re-run. Fixes SQLAlchemy LookupError loading rows whose
PostgreSQL enum value is no longer in the Python QuestionType enum.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa

from alembic import op

revision: str = "0013_repair_q_types"
down_revision: str | None = "0012_tpl_csat_emoji"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Same semantics as 0008_csat_scale_question_types.QUESTION_TYPE_MAP
_LEGACY_TO_CURRENT: tuple[tuple[str, str], ...] = (
    ("csat", "csat_5"),
    ("emoji_rating_5", "csat_5"),
    ("emoji_rating_4", "csat_4"),
    ("emoji_rating_2", "csat_2"),
    ("thumbs", "csat_2"),
)


def _remap_question(q: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    qt_raw = q.get("question_type")
    if not isinstance(qt_raw, str):
        return q, False
    for old, new in _LEGACY_TO_CURRENT:
        if qt_raw == old:
            merged = dict(q)
            merged["question_type"] = new
            return merged, True
    return q, False


def upgrade() -> None:
    conn = op.get_bind()

    for old, new in _LEGACY_TO_CURRENT:
        conn.execute(
            sa.text(
                """
                UPDATE questions
                SET question_type = CAST(:new_label AS question_type)
                WHERE questions.question_type::text = :old_label
                """
            ),
            {"old_label": old, "new_label": new},
        )
        conn.execute(
            sa.text(
                """
                UPDATE response_answers
                SET question_type = :new_label
                WHERE response_answers.question_type = :old_label
                """
            ),
            {"old_label": old, "new_label": new},
        )

    version_rows = conn.execute(sa.text("SELECT id, schema_snapshot FROM survey_versions")).fetchall()
    for vid, snap in version_rows:
        if not snap or not isinstance(snap, dict):
            continue
        qs = snap.get("questions")
        if not isinstance(qs, list):
            continue
        changed = False
        new_questions: list[Any] = []
        for q in qs:
            if isinstance(q, dict):
                nq, ch = _remap_question(q)
                new_questions.append(nq)
                if ch:
                    changed = True
            else:
                new_questions.append(q)
        if changed:
            new_snap = dict(snap)
            new_snap["questions"] = new_questions
            conn.execute(
                sa.text(
                    "UPDATE survey_versions SET schema_snapshot = CAST(:snap AS jsonb) WHERE id = CAST(:id AS uuid)"
                ),
                {"snap": json.dumps(new_snap), "id": str(vid)},
            )


def downgrade() -> None:
    raise NotImplementedError("0013 repair migration is irreversible.")
