from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.audit_schemas import AuditLogEntry
from app.auth.authorization import require_permission, require_tenant_scope
from app.auth.dependencies import get_current_principal
from app.auth.principal import Principal
from app.core.database import get_session
from app.models.audit import AuditLog
from app.models.enums import PermissionCode
from app.services.audit_list import list_tenant_audit_logs

router = APIRouter(prefix="/tenants", tags=["audit"])


def serialize_audit_log_rows(rows: list[AuditLog]) -> list[AuditLogEntry]:
    return [
        AuditLogEntry(
            id=row.id,
            occurred_at=row.occurred_at,
            actor_type=row.actor_type.value,
            actor_id=row.actor_id,
            tenant_id=row.tenant_id,
            action=row.action.value,
            resource_type=row.resource_type,
            resource_id=row.resource_id,
            outcome=row.outcome.value,
            request_id=row.request_id,
            metadata=row.metadata_json if isinstance(row.metadata_json, dict) else {},
        )
        for row in rows
    ]


def _parse_resource_types(raw: str | None) -> list[str] | None:
    if not raw or not raw.strip():
        return None
    parts = [part.strip() for part in raw.split(",") if part.strip()]
    return parts or None


@router.get("/{tenant_id}/audit-logs", response_model=list[AuditLogEntry])
async def get_tenant_audit_logs(
    tenant_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
    related_survey_id: UUID | None = None,
    resource_id: str | None = None,
    resource_types: str | None = None,
    action: str | None = None,
    q: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[AuditLogEntry]:
    require_permission(principal, PermissionCode.AUDIT_READ)
    require_tenant_scope(principal, tenant_id)
    rows = await list_tenant_audit_logs(
        session,
        tenant_id,
        related_survey_id=related_survey_id,
        resource_id=resource_id,
        resource_types=_parse_resource_types(resource_types),
        action_filter=action,
        q=q,
        limit=limit,
        offset=offset,
    )
    return serialize_audit_log_rows(rows)
