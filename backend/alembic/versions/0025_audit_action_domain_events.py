"""Expand audit_action enum for domain write events.

Revision ID: 0025_audit_domain_events
Revises: 0024_heritage_hero_start
Create Date: 2026-05-14

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0025_audit_domain_events"
down_revision: str | None = "0024_heritage_hero_start"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW_VALUES = (
    "user_updated",
    "role_created",
    "role_updated",
    "role_assigned",
    "survey_created",
    "survey_updated",
    "survey_copied",
    "survey_question_created",
    "survey_question_updated",
    "channel_updated",
    "channel_copied",
    "tenant_profile_updated",
    "tenant_platform_updated",
    "tenant_provisioned",
    "branding_updated",
    "location_created",
    "location_updated",
    "platform_template_imported",
    "platform_template_deleted",
    "platform_user_updated",
)


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for value in _NEW_VALUES:
            op.execute(sa.text(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{value}'"))


def downgrade() -> None:
    raise NotImplementedError("PostgreSQL enum values cannot be removed safely.")
