from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.enums import AuditAction, AuditActorType, AuditOutcome


async def write_audit_log(
    session: AsyncSession,
    *,
    actor_type: AuditActorType,
    actor_id: str,
    action: AuditAction,
    outcome: AuditOutcome,
    tenant_id: UUID | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    request_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    session.add(
        AuditLog(
            actor_type=actor_type,
            actor_id=actor_id,
            tenant_id=tenant_id,
            action=action,
            outcome=outcome,
            resource_type=resource_type,
            resource_id=resource_id,
            request_id=request_id,
            metadata_json=metadata or {},
        )
    )
