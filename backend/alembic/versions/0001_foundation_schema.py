"""foundation schema

Revision ID: 0001_foundation_schema
Revises:
Create Date: 2026-05-02

"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001_foundation_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


tenant_status = sa.Enum("active", "suspended", "offboarded", name="tenant_status")
user_status = sa.Enum("active", "disabled", "invited", name="user_status")
binding_scope = sa.Enum("global", "tenant", "location", name="binding_scope")
permission_code = sa.Enum(
    "tenant:create",
    "tenant:read",
    "tenant:update",
    "tenant:suspend",
    "user:create",
    "user:read",
    "user:update",
    "role:assign",
    "location:create",
    "location:read",
    "location:update",
    "branding:read",
    "branding:update",
    "audit:read",
    "pii:decrypt",
    name="permission_code",
)
audit_actor_type = sa.Enum("user", "system", "worker", name="audit_actor_type")
audit_action = sa.Enum(
    "tenant_access",
    "pii_decrypt",
    "login",
    "login_failed",
    "logout",
    "token_revoked",
    "user_created",
    "role_changed",
    "survey_published",
    "channel_created",
    "kiosk_token_created",
    name="audit_action",
)
audit_outcome = sa.Enum("success", "denied", "failed", name="audit_outcome")
queue_status = sa.Enum(
    "pending",
    "processing",
    "completed",
    "failed",
    "dead_lettered",
    name="queue_status",
)


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.Column("default_locale", sa.String(length=16), nullable=False),
        sa.Column("status", tenant_status, nullable=False),
        sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("offboarded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tenants")),
        sa.UniqueConstraint("slug", name=op.f("uq_tenants_slug")),
    )

    op.create_table(
        "permissions",
        sa.Column("code", permission_code, nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_permissions")),
        sa.UniqueConstraint("code", name="uq_permissions_code"),
    )

    op.create_table(
        "audit_logs",
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("actor_type", audit_actor_type, nullable=False),
        sa.Column("actor_id", sa.Text(), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", audit_action, nullable=False),
        sa.Column("resource_type", sa.String(length=120), nullable=True),
        sa.Column("resource_id", sa.Text(), nullable=True),
        sa.Column("outcome", audit_outcome, nullable=False),
        sa.Column("request_id", sa.String(length=120), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
    )
    op.create_index("ix_audit_logs_action_occurred_at", "audit_logs", ["action", "occurred_at"])
    op.create_index("ix_audit_logs_occurred_at", "audit_logs", ["occurred_at"])
    op.create_index("ix_audit_logs_request_id", "audit_logs", ["request_id"])
    op.create_index("ix_audit_logs_tenant_id_occurred_at", "audit_logs", ["tenant_id", "occurred_at"])

    op.create_table(
        "tenant_branding",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("primary_color", sa.String(length=16), nullable=True),
        sa.Column("secondary_color", sa.String(length=16), nullable=True),
        sa.Column("thank_you_text", sa.Text(), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name=op.f("fk_tenant_branding_tenant_id_tenants"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_tenant_branding")),
        sa.UniqueConstraint("tenant_id", name="uq_tenant_branding_tenant_id"),
    )
    op.create_index(op.f("ix_tenant_branding_tenant_id"), "tenant_branding", ["tenant_id"])

    op.create_table(
        "locations",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column("region", sa.String(length=120), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name=op.f("fk_locations_tenant_id_tenants"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_locations")),
        sa.UniqueConstraint("tenant_id", "code", name="uq_locations_tenant_id_code"),
    )
    op.create_index("ix_locations_tenant_id_city", "locations", ["tenant_id", "city"])
    op.create_index(op.f("ix_locations_tenant_id"), "locations", ["tenant_id"])

    op.create_table(
        "users",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("phone_ciphertext", sa.Text(), nullable=True),
        sa.Column("status", user_status, nullable=False),
        sa.Column("token_version", sa.Integer(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name=op.f("fk_users_tenant_id_tenants"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("tenant_id", "email", name="uq_users_tenant_id_email"),
    )
    op.create_index(op.f("ix_users_tenant_id"), "users", ["tenant_id"])
    op.create_index("ix_users_tenant_id_status", "users", ["tenant_id", "status"])

    op.create_table(
        "roles",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name=op.f("fk_roles_tenant_id_tenants"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_roles")),
        sa.UniqueConstraint("tenant_id", "code", name="uq_roles_tenant_id_code"),
    )
    op.create_index(op.f("ix_roles_tenant_id"), "roles", ["tenant_id"])

    op.create_table(
        "pii_key_registry",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("key_version", sa.Integer(), nullable=False),
        sa.Column("encrypted_dek", sa.String(), nullable=False),
        sa.Column("encryption_context", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name=op.f("fk_pii_key_registry_tenant_id_tenants"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_pii_key_registry")),
        sa.UniqueConstraint("tenant_id", "key_version", name="uq_pii_key_registry_tenant_version"),
    )
    op.create_index("ix_pii_key_registry_tenant_active", "pii_key_registry", ["tenant_id", "retired_at"])
    op.create_index(op.f("ix_pii_key_registry_tenant_id"), "pii_key_registry", ["tenant_id"])

    op.create_table(
        "role_permissions",
        sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("permission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["permission_id"], ["permissions.id"], name=op.f("fk_role_permissions_permission_id_permissions"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], name=op.f("fk_role_permissions_role_id_roles"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("role_id", "permission_id", name=op.f("pk_role_permissions")),
        sa.UniqueConstraint("role_id", "permission_id", name="uq_role_permissions_role_permission"),
    )

    op.create_table(
        "user_role_bindings",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scope", binding_scope, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], name=op.f("fk_user_role_bindings_location_id_locations"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], name=op.f("fk_user_role_bindings_role_id_roles"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name=op.f("fk_user_role_bindings_tenant_id_tenants"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_user_role_bindings_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_role_bindings")),
        sa.UniqueConstraint("user_id", "role_id", "scope", "tenant_id", "location_id", name="uq_user_role_bindings_scope"),
    )
    op.create_index(op.f("ix_user_role_bindings_location_id"), "user_role_bindings", ["location_id"])
    op.create_index(op.f("ix_user_role_bindings_role_id"), "user_role_bindings", ["role_id"])
    op.create_index(op.f("ix_user_role_bindings_tenant_id"), "user_role_bindings", ["tenant_id"])
    op.create_index("ix_user_role_bindings_tenant_location", "user_role_bindings", ["tenant_id", "location_id"])
    op.create_index(op.f("ix_user_role_bindings_user_id"), "user_role_bindings", ["user_id"])

    op.create_table(
        "feedback_submission_queue",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("channel_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("survey_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("idempotency_key_hash", sa.String(length=128), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", queue_status, nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("locked_by", sa.String(length=120), nullable=True),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("request_id", sa.String(length=120), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name=op.f("fk_feedback_submission_queue_tenant_id_tenants"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_feedback_submission_queue")),
        sa.UniqueConstraint("tenant_id", "channel_id", "idempotency_key_hash", name="uq_feedback_submission_queue_idempotency"),
    )
    op.create_index(op.f("ix_feedback_submission_queue_channel_id"), "feedback_submission_queue", ["channel_id"])
    op.create_index(op.f("ix_feedback_submission_queue_status"), "feedback_submission_queue", ["status"])
    op.create_index("ix_feedback_submission_queue_locked_until", "feedback_submission_queue", ["locked_until"])
    op.create_index("ix_feedback_submission_queue_status_next_attempt", "feedback_submission_queue", ["status", "next_attempt_at"])
    op.create_index(op.f("ix_feedback_submission_queue_survey_version_id"), "feedback_submission_queue", ["survey_version_id"])
    op.create_index(op.f("ix_feedback_submission_queue_tenant_id"), "feedback_submission_queue", ["tenant_id"])

    op.create_table(
        "feedback_submission_dead_letters",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("queue_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("channel_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("survey_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("error_class", sa.String(length=160), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name=op.f("fk_feedback_submission_dead_letters_tenant_id_tenants"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_feedback_submission_dead_letters")),
    )
    op.create_index("ix_feedback_submission_dead_letters_error_class", "feedback_submission_dead_letters", ["error_class"])
    op.create_index("ix_feedback_submission_dead_letters_tenant_created", "feedback_submission_dead_letters", ["tenant_id", "created_at"])
    op.create_index(op.f("ix_feedback_submission_dead_letters_queue_id"), "feedback_submission_dead_letters", ["queue_id"])
    op.create_index(op.f("ix_feedback_submission_dead_letters_tenant_id"), "feedback_submission_dead_letters", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("feedback_submission_dead_letters")
    op.drop_table("feedback_submission_queue")
    op.drop_table("user_role_bindings")
    op.drop_table("role_permissions")
    op.drop_table("pii_key_registry")
    op.drop_table("roles")
    op.drop_table("users")
    op.drop_table("locations")
    op.drop_table("tenant_branding")
    op.drop_table("audit_logs")
    op.drop_table("permissions")
    op.drop_table("tenants")

    queue_status.drop(op.get_bind(), checkfirst=True)
    audit_outcome.drop(op.get_bind(), checkfirst=True)
    audit_action.drop(op.get_bind(), checkfirst=True)
    audit_actor_type.drop(op.get_bind(), checkfirst=True)
    permission_code.drop(op.get_bind(), checkfirst=True)
    binding_scope.drop(op.get_bind(), checkfirst=True)
    user_status.drop(op.get_bind(), checkfirst=True)
    tenant_status.drop(op.get_bind(), checkfirst=True)
