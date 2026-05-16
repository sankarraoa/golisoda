from uuid import UUID

from sqlalchemy import String, cast, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.enums import AuditAction


def _apply_search(stmt, q: str | None):
    if not q or not (term := q.strip()):
        return stmt
    pattern = f"%{term}%"
    return stmt.where(
        or_(
            cast(AuditLog.action, String).ilike(pattern),
            cast(AuditLog.resource_type, String).ilike(pattern),
            cast(AuditLog.resource_id, String).ilike(pattern),
            cast(AuditLog.metadata_json, String).ilike(pattern),
            cast(AuditLog.request_id, String).ilike(pattern),
        )
    )


def _apply_action_filter(stmt, action: str | None):
    if not action or not (raw := action.strip()):
        return stmt
    try:
        parsed = AuditAction(raw)
        return stmt.where(AuditLog.action == parsed)
    except ValueError:
        return stmt.where(cast(AuditLog.action, String).ilike(f"%{raw}%"))


async def list_tenant_audit_logs(
    session: AsyncSession,
    tenant_id: UUID,
    *,
    related_survey_id: UUID | None,
    resource_id: str | None,
    resource_types: list[str] | None,
    action_filter: str | None,
    q: str | None,
    limit: int,
    offset: int,
) -> list[AuditLog]:
    stmt = select(AuditLog).where(AuditLog.tenant_id == tenant_id)

    if related_survey_id is not None:
        sid = str(related_survey_id)
        stmt = stmt.where(
            or_(
                (AuditLog.resource_type == "survey") & (AuditLog.resource_id == sid),
                AuditLog.metadata_json["survey_id"].as_string() == sid,
            )
        )
    elif resource_id is not None and resource_id.strip():
        stmt = stmt.where(AuditLog.resource_id == resource_id.strip())

    if resource_types:
        stmt = stmt.where(AuditLog.resource_type.in_(resource_types))

    stmt = _apply_action_filter(stmt, action_filter)
    stmt = _apply_search(stmt, q)
    stmt = stmt.order_by(AuditLog.occurred_at.desc()).limit(min(max(limit, 1), 100)).offset(max(offset, 0))
    return list((await session.scalars(stmt)).all())


async def list_platform_audit_logs(
    session: AsyncSession,
    *,
    page: str,
    action_filter: str | None,
    q: str | None,
    limit: int,
    offset: int,
) -> list[AuditLog]:
    stmt = select(AuditLog)
    if page == "templates":
        stmt = stmt.where(
            AuditLog.resource_type == "survey_template",
            AuditLog.tenant_id.is_(None),
        )
    elif page == "tenants":
        stmt = stmt.where(
            AuditLog.action.in_(
                (
                    AuditAction.TENANT_PROVISIONED,
                    AuditAction.TENANT_PLATFORM_UPDATED,
                )
            )
        )
    elif page == "users":
        stmt = stmt.where(AuditLog.resource_type == "platform_user")
    else:
        raise ValueError(f"invalid audit page: {page}")

    stmt = _apply_action_filter(stmt, action_filter)
    stmt = _apply_search(stmt, q)
    stmt = stmt.order_by(AuditLog.occurred_at.desc()).limit(min(max(limit, 1), 100)).offset(max(offset, 0))
    return list((await session.scalars(stmt)).all())
