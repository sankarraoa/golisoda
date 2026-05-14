"""Add phone_portrait survey template (QR / SMS on handheld, portrait-first).

Revision ID: 0020_phone_portrait_tpl
Revises: 0019_platform_super_admin
"""

from collections.abc import Sequence
from uuid import UUID

import sqlalchemy as sa

from alembic import op

revision: str = "0020_phone_portrait_tpl"
down_revision: str | None = "0019_platform_super_admin"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TEMPLATE_PHONE_PORTRAIT = UUID("f0000006-0000-4000-a000-000000000006")

# Stepper + dot progress + emoji CSAT + large touch (thumb-friendly on narrow portrait screens).
PRESENTATION = (
    '{"layout":"stepper","nps":{"presentation":"numeric"},"csat_5":{"renderer":"emoji_5"},'
    '"csat_4":{"renderer":"emoji_4"},"csat_2":{"renderer":"emoji_2"},'
    '"progress":{"style":"dots"},"navigation":{"auto_advance":false},"touch":{"large_targets":true}}'
)


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            INSERT INTO survey_templates
              (id, slug, name, description, deployment_notes, presentation, sort_order, is_active)
            VALUES
              (:id, :slug, :name, :description, :notes, CAST(:presentation AS JSONB), :sort_order, true)
            ON CONFLICT (slug) DO NOTHING
            """
        ),
        {
            "id": str(TEMPLATE_PHONE_PORTRAIT),
            "slug": "phone_portrait",
            "name": "Phone (portrait)",
            "description": (
                "Step-by-step flow with dot progress and comfortable tap targets—tuned for narrow "
                "portrait screens (QR codes and personal links on a phone)."
            ),
            "notes": (
                "Use for channels where guests answer on their own phone in portrait. Not intended for "
                "shared kiosk displays; use Kiosk / touch for tablets on a stand."
            ),
            "presentation": PRESENTATION,
            "sort_order": 15,
        },
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM survey_templates WHERE slug = 'phone_portrait'"))
