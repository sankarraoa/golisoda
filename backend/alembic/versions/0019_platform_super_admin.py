"""platform:manage permission enum + unique email for platform-level users.

Revision ID: 0019_platform_super_admin
Revises: 0018_tenant_organization_address
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019_platform_super_admin"
down_revision: str | None = "0018_tenant_organization_address"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TYPE permission_code ADD VALUE IF NOT EXISTS 'platform:manage'"))
    op.create_index(
        "uq_users_platform_email",
        "users",
        ["email"],
        unique=True,
        postgresql_where=sa.text("tenant_id IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_users_platform_email", table_name="users")
