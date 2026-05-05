"""granular rbac

Revision ID: 0005_granular_rbac
Revises: 0004_feedback_submit
Create Date: 2026-05-05

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005_granular_rbac"
down_revision: str | None = "0004_feedback_submit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_PERMISSION_CODES = [
    "user:archive",
    "role:create",
    "role:read",
    "role:update",
    "location:archive",
    "survey:copy",
    "survey:archive",
    "channel:archive",
    "response:read",
    "analytics:read",
]

ALL_PERMISSION_CODES = [
    "tenant:create",
    "tenant:read",
    "tenant:update",
    "tenant:suspend",
    "user:create",
    "user:read",
    "user:update",
    "user:archive",
    "role:create",
    "role:read",
    "role:update",
    "role:assign",
    "location:create",
    "location:read",
    "location:update",
    "location:archive",
    "branding:read",
    "branding:update",
    "survey:create",
    "survey:read",
    "survey:update",
    "survey:copy",
    "survey:archive",
    "survey:publish",
    "channel:create",
    "channel:read",
    "channel:update",
    "channel:archive",
    "response:read",
    "analytics:read",
    "audit:read",
    "pii:decrypt",
]

LOCATION_MANAGER_PERMISSION_CODES = [
    "tenant:read",
    "location:read",
    "location:update",
    "survey:create",
    "survey:read",
    "survey:update",
    "survey:copy",
    "survey:publish",
    "channel:create",
    "channel:read",
    "channel:update",
    "response:read",
    "analytics:read",
]

ANALYST_PERMISSION_CODES = [
    "tenant:read",
    "location:read",
    "survey:read",
    "channel:read",
    "response:read",
    "analytics:read",
]


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for permission_code in NEW_PERMISSION_CODES:
            op.execute(f"ALTER TYPE permission_code ADD VALUE IF NOT EXISTS '{permission_code}'")

    op.add_column(
        "surveys",
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    for permission_code in ALL_PERMISSION_CODES:
        op.execute(
            f"""
            INSERT INTO permissions (id, code, description, created_at, updated_at)
            VALUES (
                (
                    substr(md5('{permission_code}'), 1, 8) || '-' ||
                    substr(md5('{permission_code}'), 9, 4) || '-' ||
                    substr(md5('{permission_code}'), 13, 4) || '-' ||
                    substr(md5('{permission_code}'), 17, 4) || '-' ||
                    substr(md5('{permission_code}'), 21, 12)
                )::uuid,
                '{permission_code}',
                '{permission_code}',
                now(),
                now()
            )
            ON CONFLICT (code) DO NOTHING
            """
        )

    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT roles.id, permissions.id
        FROM roles
        CROSS JOIN permissions
        WHERE roles.code = 'tenant_admin' AND roles.tenant_id IS NULL
        ON CONFLICT DO NOTHING
        """
    )
    for role_code, permission_codes in {
        "location_manager": LOCATION_MANAGER_PERMISSION_CODES,
        "analyst": ANALYST_PERMISSION_CODES,
    }.items():
        quoted_permissions = ", ".join(f"'{permission_code}'" for permission_code in permission_codes)
        op.execute(
            f"""
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT roles.id, permissions.id
            FROM roles
            JOIN permissions ON permissions.code IN ({quoted_permissions})
            WHERE roles.code = '{role_code}' AND roles.tenant_id IS NULL
            ON CONFLICT DO NOTHING
            """
        )


def downgrade() -> None:
    op.drop_column("surveys", "created_by_user_id")
