from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.response_schemas import (
    AnalyticsSummaryResponse,
    FeedbackResponseRead,
    ResponseAnswerRead,
)
from app.auth.authorization import require_permission, require_tenant_scope
from app.auth.dependencies import get_current_principal
from app.auth.principal import Principal
from app.core.database import get_session
from app.models.channel import FeedbackChannel
from app.models.enums import ChannelStatus, PermissionCode
from app.models.response import Response, ResponseAnswer
from app.models.tenant import Location

router = APIRouter(prefix="/tenants/{tenant_id}", tags=["responses"])


def is_location_scoped(principal: Principal) -> bool:
    return len(principal.location_ids) > 0


@router.get("/responses", response_model=list[FeedbackResponseRead])
async def list_feedback_responses(
    tenant_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = 25,
) -> list[FeedbackResponseRead]:
    require_permission(principal, PermissionCode.RESPONSE_READ)
    require_tenant_scope(principal, tenant_id)

    response_query = (
        select(Response, FeedbackChannel.name, Location.name)
        .join(FeedbackChannel, FeedbackChannel.id == Response.channel_id)
        .join(Location, Location.id == Response.location_id)
        .where(Response.tenant_id == tenant_id)
    )
    if is_location_scoped(principal):
        response_query = response_query.where(Response.location_id.in_(principal.location_ids))
    response_rows = await session.execute(
        response_query.order_by(Response.submitted_at.desc()).limit(min(limit, 100))
    )

    items = []
    for response, channel_name, location_name in response_rows:
        answers = await session.scalars(
            select(ResponseAnswer)
            .where(ResponseAnswer.response_id == response.id)
            .order_by(ResponseAnswer.created_at)
        )
        items.append(
            FeedbackResponseRead(
                id=response.id,
                tenant_id=response.tenant_id,
                channel_id=response.channel_id,
                channel_name=channel_name,
                location_id=response.location_id,
                location_name=location_name,
                survey_version_id=response.survey_version_id,
                locale=response.locale,
                submitted_at=response.submitted_at,
                answers=[
                    ResponseAnswerRead(
                        question_key=answer.question_key,
                        question_type=answer.question_type,
                        value=None if answer.is_pii else answer.value_json,
                        is_pii=answer.is_pii,
                    )
                    for answer in answers
                ],
            )
        )
    return items


@router.get("/analytics/summary", response_model=AnalyticsSummaryResponse)
async def get_analytics_summary(
    tenant_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AnalyticsSummaryResponse:
    require_permission(principal, PermissionCode.ANALYTICS_READ)
    require_tenant_scope(principal, tenant_id)

    response_filters = [Response.tenant_id == tenant_id]
    channel_filters = [
        FeedbackChannel.tenant_id == tenant_id,
        FeedbackChannel.status == ChannelStatus.ACTIVE,
    ]
    if is_location_scoped(principal):
        response_filters.append(Response.location_id.in_(principal.location_ids))
        channel_filters.append(FeedbackChannel.location_id.in_(principal.location_ids))

    total_responses = await session.scalar(
        select(func.count()).select_from(Response).where(*response_filters)
    )
    active_channels = await session.scalar(
        select(func.count())
        .select_from(FeedbackChannel)
        .where(*channel_filters)
    )
    nps_average = await _average_numeric_answer(
        session,
        tenant_id=tenant_id,
        question_type="nps",
        location_ids=principal.location_ids if is_location_scoped(principal) else None,
    )
    csat_average = await _average_numeric_answer(
        session,
        tenant_id=tenant_id,
        question_type="csat",
        location_ids=principal.location_ids if is_location_scoped(principal) else None,
    )
    return AnalyticsSummaryResponse(
        total_responses=total_responses or 0,
        nps_average=nps_average,
        csat_average=csat_average,
        active_channels=active_channels or 0,
    )


async def _average_numeric_answer(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    question_type: str,
    location_ids: list[UUID] | None = None,
) -> float | None:
    answer_query = select(ResponseAnswer.value_json).where(
        ResponseAnswer.tenant_id == tenant_id,
        ResponseAnswer.question_type == question_type,
        ResponseAnswer.is_pii.is_(False),
    )
    if location_ids:
        answer_query = answer_query.join(Response, Response.id == ResponseAnswer.response_id).where(
            Response.location_id.in_(location_ids)
        )
    values = await session.scalars(answer_query)
    numeric_values = [value for value in values if isinstance(value, int | float)]
    if not numeric_values:
        return None
    return round(sum(numeric_values) / len(numeric_values), 2)
