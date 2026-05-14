from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.response_schemas import (
    AnalyticsSummaryResponse,
    ChoiceCountRow,
    Csat2DashboardResponse,
    DistributionBucket,
    FeedbackResponseListResponse,
    FeedbackResponseRead,
    NpsDashboardResponse,
    QuestionAggregateRead,
    ResponseAggregateReport,
    ResponseAnswerRead,
    ResponseQuestionDefinition,
    VersionCohortAggregateRead,
)
from app.auth.authorization import require_permission, require_tenant_scope
from app.auth.dependencies import get_current_principal
from app.auth.principal import Principal
from app.core.database import get_session
from app.models.channel import FeedbackChannel
from app.models.enums import ChannelStatus, PermissionCode
from app.models.response import Response, ResponseAnswer
from app.models.survey import Survey, SurveyVersion
from app.models.tenant import Location
from app.services import response_reports

router = APIRouter(prefix="/tenants/{tenant_id}", tags=["responses"])


def is_location_scoped(principal: Principal) -> bool:
    return len(principal.location_ids) > 0


async def _require_channel_in_tenant(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    channel_id: UUID,
    principal: Principal,
) -> FeedbackChannel:
    channel = await session.get(FeedbackChannel, channel_id)
    if channel is None or channel.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found.")
    if is_location_scoped(principal) and channel.location_id not in principal.location_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden.")
    return channel


@router.get("/responses/aggregate", response_model=ResponseAggregateReport)
async def aggregate_feedback_responses(
    tenant_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
    channel_id: UUID | None = None,
    survey_version_id: UUID | None = None,
    submitted_after: datetime | None = None,
    submitted_before: datetime | None = None,
) -> ResponseAggregateReport:
    require_permission(principal, PermissionCode.RESPONSE_READ)
    require_tenant_scope(principal, tenant_id)
    channel_name = "All channels"
    if channel_id is not None:
        channel = await _require_channel_in_tenant(
            session,
            tenant_id=tenant_id,
            channel_id=channel_id,
            principal=principal,
        )
        channel_name = channel.name

    loc_ids = principal.location_ids if is_location_scoped(principal) else None
    raw = await response_reports.aggregate_channel_responses(
        session,
        tenant_id=tenant_id,
        channel_id=channel_id,
        survey_version_id=survey_version_id,
        submitted_after=submitted_after,
        submitted_before=submitted_before,
        location_ids=loc_ids,
    )
    cohorts: list[VersionCohortAggregateRead] = []
    for c in raw["cohorts"]:
        questions: list[QuestionAggregateRead] = []
        for q in c["questions"]:
            questions.append(
                QuestionAggregateRead(
                    question_key=q["question_key"],
                    question_type=q["question_type"],
                    prompt=q["prompt"],
                    sort_order=q["sort_order"],
                    answered_count=q["answered_count"],
                    cohort_response_count=q["cohort_response_count"],
                    average=q["average"],
                    min_value=q["min_value"],
                    max_value=q["max_value"],
                    distribution=[DistributionBucket(**b) for b in q["distribution"]],
                    choice_counts=[ChoiceCountRow(**r) for r in q["choice_counts"]],
                    text_sample_count=q["text_sample_count"],
                    text_samples=q["text_samples"],
                )
            )
        cohorts.append(
            VersionCohortAggregateRead(
                survey_version_id=c["survey_version_id"],
                survey_id=c["survey_id"],
                survey_title=c["survey_title"],
                version_number=c["version_number"],
                response_count=c["response_count"],
                questions=questions,
            )
        )
    return ResponseAggregateReport(
        channel_id=channel_id,
        channel_name=channel_name,
        submitted_after=submitted_after,
        submitted_before=submitted_before,
        cohorts=cohorts,
    )


@router.get("/analytics/nps-dashboard", response_model=NpsDashboardResponse)
async def nps_analytics_dashboard(
    tenant_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
    question_key: str = Query(..., min_length=1, max_length=120),
    channel_id: UUID | None = None,
    survey_version_id: UUID | None = None,
) -> NpsDashboardResponse:
    require_permission(principal, PermissionCode.ANALYTICS_READ)
    require_tenant_scope(principal, tenant_id)
    if channel_id is not None:
        await _require_channel_in_tenant(
            session,
            tenant_id=tenant_id,
            channel_id=channel_id,
            principal=principal,
        )
    elif survey_version_id is not None:
        version_row = await session.get(SurveyVersion, survey_version_id)
        if version_row is None or version_row.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Survey version not found.",
            )

    loc_ids = principal.location_ids if is_location_scoped(principal) else None
    raw = await response_reports.build_nps_analytics_dashboard(
        session,
        tenant_id=tenant_id,
        channel_id=channel_id,
        survey_version_id=survey_version_id,
        question_key=question_key,
        location_ids=loc_ids,
    )
    return NpsDashboardResponse(**raw)


@router.get("/analytics/csat2-dashboard", response_model=Csat2DashboardResponse)
async def csat2_analytics_dashboard(
    tenant_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
    question_key: str = Query(..., min_length=1, max_length=120),
    channel_id: UUID | None = None,
    survey_version_id: UUID | None = None,
) -> Csat2DashboardResponse:
    require_permission(principal, PermissionCode.ANALYTICS_READ)
    require_tenant_scope(principal, tenant_id)
    if channel_id is not None:
        await _require_channel_in_tenant(
            session,
            tenant_id=tenant_id,
            channel_id=channel_id,
            principal=principal,
        )
    elif survey_version_id is not None:
        version_row = await session.get(SurveyVersion, survey_version_id)
        if version_row is None or version_row.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Survey version not found.",
            )

    loc_ids = principal.location_ids if is_location_scoped(principal) else None
    raw = await response_reports.build_csat2_binary_dashboard(
        session,
        tenant_id=tenant_id,
        channel_id=channel_id,
        survey_version_id=survey_version_id,
        question_key=question_key,
        location_ids=loc_ids,
    )
    return Csat2DashboardResponse(**raw)


@router.get("/responses", response_model=FeedbackResponseListResponse)
async def list_feedback_responses(
    tenant_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
    channel_id: UUID | None = None,
    survey_version_id: UUID | None = None,
    submitted_after: datetime | None = None,
    submitted_before: datetime | None = None,
    limit: int = 25,
    offset: int = 0,
) -> FeedbackResponseListResponse:
    require_permission(principal, PermissionCode.RESPONSE_READ)
    require_tenant_scope(principal, tenant_id)

    if channel_id is not None:
        await _require_channel_in_tenant(
            session,
            tenant_id=tenant_id,
            channel_id=channel_id,
            principal=principal,
        )

    loc_ids = principal.location_ids if is_location_scoped(principal) else None
    conds = response_reports.base_response_filter(
        tenant_id,
        channel_id=channel_id,
        survey_version_id=survey_version_id,
        submitted_after=submitted_after,
        submitted_before=submitted_before,
        location_ids=loc_ids,
    )

    total = await response_reports.count_responses(session, conds)

    safe_limit = min(max(limit, 1), 100)
    safe_offset = max(offset, 0)

    stmt: Select = (
        select(Response, FeedbackChannel.name, Location.name, SurveyVersion, Survey.title)
        .join(FeedbackChannel, FeedbackChannel.id == Response.channel_id)
        .join(Location, Location.id == Response.location_id)
        .join(SurveyVersion, SurveyVersion.id == Response.survey_version_id)
        .join(Survey, Survey.id == SurveyVersion.survey_id)
        .where(*conds)
        .order_by(Response.submitted_at.desc())
        .offset(safe_offset)
        .limit(safe_limit)
    )
    response_rows = await session.execute(stmt)
    row_list = list(response_rows.all())

    response_ids = [row[0].id for row in row_list]
    answers_by_response: dict[UUID, list[ResponseAnswer]] = {}
    if response_ids:
        answer_rows = await session.scalars(
            select(ResponseAnswer)
            .where(ResponseAnswer.response_id.in_(response_ids))
            .order_by(ResponseAnswer.response_id, ResponseAnswer.created_at)
        )
        for ans in answer_rows:
            answers_by_response.setdefault(ans.response_id, []).append(ans)

    version_ids = {row[0].survey_version_id for row in row_list}
    versions_map = await response_reports.load_versions_map(session, tenant_id, version_ids)
    qdefs_map = response_reports.question_defs_for_versions(versions_map)

    items: list[FeedbackResponseRead] = []
    for response, channel_name, location_name, survey_version, survey_title in row_list:
        answers = answers_by_response.get(response.id, [])
        qdefs_raw = qdefs_map.get(response.survey_version_id, [])
        items.append(
            FeedbackResponseRead(
                id=response.id,
                tenant_id=response.tenant_id,
                channel_id=response.channel_id,
                channel_name=channel_name,
                location_id=response.location_id,
                location_name=location_name,
                survey_id=survey_version.survey_id,
                survey_title=survey_title,
                survey_version_id=response.survey_version_id,
                survey_version_number=survey_version.version_number,
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
                question_definitions=[
                    ResponseQuestionDefinition(
                        question_key=d["question_key"],
                        question_type=d["question_type"],
                        prompt=d["prompt"],
                        sort_order=d["sort_order"],
                        options=d["options"],
                    )
                    for d in qdefs_raw
                ],
            )
        )

    return FeedbackResponseListResponse(
        total=total,
        limit=safe_limit,
        offset=safe_offset,
        items=items,
    )


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
        select(func.count()).select_from(FeedbackChannel).where(*channel_filters)
    )
    nps_average = await _average_numeric_answer(
        session,
        tenant_id=tenant_id,
        question_types=("nps",),
        location_ids=principal.location_ids if is_location_scoped(principal) else None,
    )
    csat_average = await _average_numeric_answer(
        session,
        tenant_id=tenant_id,
        question_types=("csat_5", "csat_4", "csat_2"),
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
    question_types: tuple[str, ...],
    location_ids: list[UUID] | None = None,
) -> float | None:
    answer_query = select(ResponseAnswer.value_json).where(
        ResponseAnswer.tenant_id == tenant_id,
        ResponseAnswer.question_type.in_(question_types),
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
