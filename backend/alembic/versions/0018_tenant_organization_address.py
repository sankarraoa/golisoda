"""Tenant organization postal address columns.

Revision ID: 0018_tenant_organization_address
Revises: 0017_theme_tokens
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018_tenant_organization_address"
down_revision: str | None = "0017_theme_tokens"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("address_line1", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "tenants",
        sa.Column("address_line2", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "tenants",
        sa.Column("address_city", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "tenants",
        sa.Column("address_state", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "tenants",
        sa.Column("address_postal_code", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenants", "address_postal_code")
    op.drop_column("tenants", "address_state")
    op.drop_column("tenants", "address_city")
    op.drop_column("tenants", "address_line2")
    op.drop_column("tenants", "address_line1")
