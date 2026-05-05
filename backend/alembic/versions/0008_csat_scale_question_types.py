"""Consolidate CSAT visual variants into scale types (csat_5/csat_4/csat_2).

Revision ID: 0008_csat_scale_question_types
Revises: 0007_survey_templates
"""

from collections.abc import Mapping, Sequence
import json
from typing import Any

import sqlalchemy as sa

from alembic import op

revision: str = "0008_csat_scale"
down_revision: str | None = "0007_survey_templates"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


QUESTION_TYPE_MAP = {
    "csat": "csat_5",
    "emoji_rating_5": "csat_5",
    "emoji_rating_4": "csat_4",
    "emoji_rating_2": "csat_2",
    "thumbs": "csat_2",
}


def _remap_question_dict(q: dict[str, Any]) -> dict[str, Any]:
    qt = q.get("question_type")
    if isinstance(qt, str) and qt in QUESTION_TYPE_MAP:
        next_q = dict(q)
        next_q["question_type"] = QUESTION_TYPE_MAP[qt]
        return next_q
    return q


def _migrate_presentation_blob(raw: Any) -> Any:
    if not isinstance(raw, Mapping):
        return raw
    data = dict(raw)
    legacy = data.pop("csat", None)
    lp = "digits"
    if isinstance(legacy, Mapping):
        v = legacy.get("presentation")
        if isinstance(v, str):
            lp = v
    pres_map5 = {"digits": "numeric", "stars": "stars", "emoji": "emoji_5"}
    pres_map4 = {"digits": "numeric", "stars": "stars", "emoji": "emoji_4"}
    pres_map2 = {"digits": "numeric", "stars": "numeric", "emoji": "emoji_2"}
    data["csat_5"] = {"renderer": pres_map5.get(lp, "numeric")}
    data["csat_4"] = {"renderer": pres_map4.get(lp, "numeric")}
    data["csat_2"] = {"renderer": pres_map2.get(lp, "numeric")}
    return data


def _presentation_needs_rewrite(raw: Any) -> bool:
    return isinstance(raw, Mapping) and "csat" in raw and "csat_5" not in raw


def upgrade() -> None:
    conn = op.get_bind()

    # New enum labels must be committed before any UPDATE can reference them (PG + asyncpg).
    with op.get_context().autocommit_block():
        for value in ("csat_5", "csat_4"):
            op.execute(sa.text(f"ALTER TYPE question_type ADD VALUE IF NOT EXISTS '{value}'"))

    swaps = (
        ("'csat'", "'csat_5'"),
        ("'emoji_rating_5'", "'csat_5'"),
        ("'emoji_rating_4'", "'csat_4'"),
        ("'emoji_rating_2'", "'csat_2'"),
        ("'thumbs'", "'csat_2'"),
    )
    for old_lit, new_lit in swaps:
        conn.execute(sa.text(f"UPDATE questions SET question_type = {new_lit} WHERE question_type = {old_lit}"))
        conn.execute(sa.text(f"UPDATE response_answers SET question_type = {new_lit} WHERE question_type = {old_lit}"))

    version_rows = conn.execute(sa.text("SELECT id, schema_snapshot FROM survey_versions")).fetchall()
    for vid, snap in version_rows:
        if not snap or not isinstance(snap, dict):
            continue
        qs = snap.get("questions")
        if not isinstance(qs, list):
            continue
        new_questions = [_remap_question_dict(q) if isinstance(q, dict) else q for q in qs]
        if new_questions == qs:
            continue
        new_snap = dict(snap)
        new_snap["questions"] = new_questions
        conn.execute(
            sa.text("UPDATE survey_versions SET schema_snapshot = CAST(:snap AS jsonb) WHERE id = CAST(:id AS uuid)"),
            {"snap": json.dumps(new_snap), "id": str(vid)},
        )

    tmpl_rows = conn.execute(sa.text("SELECT id, presentation FROM survey_templates")).fetchall()
    for tid, pres in tmpl_rows:
        if not isinstance(pres, dict) or not _presentation_needs_rewrite(pres):
            continue
        new_pres = _migrate_presentation_blob(pres)
        conn.execute(
            sa.text("UPDATE survey_templates SET presentation = CAST(:p AS jsonb) WHERE id = CAST(:id AS uuid)"),
            {"p": json.dumps(new_pres), "id": str(tid)},
        )


def downgrade() -> None:
    raise NotImplementedError("0008_csat_scale_question_types is irreversible.")
