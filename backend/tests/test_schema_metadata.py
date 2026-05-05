from app.models import Base
from app.models.enums import (
    AuditAction,
    BindingScope,
    PermissionCode,
    QueueStatus,
    TenantStatus,
)


def test_foundation_tables_are_registered() -> None:
    expected_tables = {
        "tenants",
        "tenant_branding",
        "locations",
        "users",
        "roles",
        "permissions",
        "role_permissions",
        "user_role_bindings",
        "audit_logs",
        "pii_key_registry",
        "feedback_submission_queue",
        "feedback_submission_dead_letters",
        "surveys",
        "survey_versions",
        "questions",
        "question_options",
        "translations",
        "feedback_channels",
        "responses",
        "response_answers",
    }

    assert expected_tables.issubset(Base.metadata.tables.keys())


def test_tenant_scoped_tables_have_tenant_id() -> None:
    tenant_scoped_tables = {
        "tenant_branding",
        "locations",
        "users",
        "roles",
        "user_role_bindings",
        "pii_key_registry",
        "feedback_submission_queue",
        "feedback_submission_dead_letters",
        "surveys",
        "survey_versions",
        "questions",
        "question_options",
        "translations",
        "feedback_channels",
        "responses",
        "response_answers",
    }

    for table_name in tenant_scoped_tables:
        assert "tenant_id" in Base.metadata.tables[table_name].columns


def test_core_enum_values_match_architecture_decisions() -> None:
    assert TenantStatus.SUSPENDED.value == "suspended"
    assert BindingScope.LOCATION.value == "location"
    assert PermissionCode.PII_DECRYPT.value == "pii:decrypt"
    assert PermissionCode.SURVEY_PUBLISH.value == "survey:publish"
    assert PermissionCode.CHANNEL_CREATE.value == "channel:create"
    assert AuditAction.PII_DECRYPT.value == "pii_decrypt"
    assert QueueStatus.DEAD_LETTERED.value == "dead_lettered"


def test_feedback_queue_has_idempotency_constraint() -> None:
    queue_table = Base.metadata.tables["feedback_submission_queue"]
    unique_constraint_names = {constraint.name for constraint in queue_table.constraints}

    assert "uq_feedback_submission_queue_idempotency" in unique_constraint_names


def test_responses_have_idempotency_constraint() -> None:
    responses_table = Base.metadata.tables["responses"]
    unique_constraint_names = {constraint.name for constraint in responses_table.constraints}

    assert "uq_responses_idempotency" in unique_constraint_names


def test_audit_log_has_request_id_and_metadata() -> None:
    audit_table = Base.metadata.tables["audit_logs"]

    assert "request_id" in audit_table.columns
    assert "metadata" in audit_table.columns
