from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.survey_schemas import (
    QuestionCreateRequest,
    QuestionOptionResponse,
    QuestionResponse,
    QuestionUpdateRequest,
    SurveyCopyRequest,
    SurveyCreateRequest,
    SurveyDetailResponse,
    SurveyResponse,
    SurveyUpdateRequest,
    SurveyVersionResponse,
)
from app.auth.authorization import require_permission, require_tenant_scope
from app.auth.dependencies import get_current_principal
from app.auth.principal import Principal
from app.core.database import get_session
from app.models.channel import FeedbackChannel
from app.models.enums import (
    AuditAction,
    AuditActorType,
    AuditOutcome,
    PermissionCode,
    QuestionType,
    SurveyStatus,
    SurveyVersionStatus,
)
from app.models.survey import Question, QuestionOption, Survey, SurveyVersion
from app.models.tenant import Tenant
from app.services.audit import write_audit_log
from app.services.surveys import publish_survey_version

router = APIRouter(prefix="/tenants/{tenant_id}/surveys", tags=["surveys"])


async def get_tenant_or_404(session: AsyncSession, tenant_id: UUID) -> Tenant:
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    return tenant


async def get_survey_or_404(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    survey_id: UUID,
) -> Survey:
    survey = await session.get(Survey, survey_id)
    if survey is None or survey.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found.")
    return survey


def is_location_scoped(principal: Principal) -> bool:
    return len(principal.location_ids) > 0


def can_modify_survey(principal: Principal, survey: Survey) -> bool:
    return survey.created_by_user_id is None or survey.created_by_user_id == principal.user_id


def require_survey_owner_or_admin(principal: Principal, survey: Survey) -> None:
    if not can_modify_survey(principal, survey):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only modify surveys you created.",
        )


async def serialize_question(session: AsyncSession, question: Question) -> QuestionResponse:
    options = await session.scalars(
        select(QuestionOption)
        .where(QuestionOption.question_id == question.id)
        .order_by(QuestionOption.sort_order, QuestionOption.created_at)
    )
    return QuestionResponse(
        id=question.id,
        tenant_id=question.tenant_id,
        survey_id=question.survey_id,
        question_key=question.question_key,
        question_type=question.question_type,
        prompt=question.prompt,
        help_text=question.help_text,
        is_required=question.is_required,
        is_pii=question.is_pii,
        sort_order=question.sort_order,
        branching_metadata=question.branching_metadata,
        options=[
            QuestionOptionResponse(
                id=option.id,
                value=option.value,
                label=option.label,
                sort_order=option.sort_order,
            )
            for option in options
        ],
        created_at=question.created_at,
        updated_at=question.updated_at,
    )


async def serialize_survey_detail(session: AsyncSession, survey: Survey) -> SurveyDetailResponse:
    questions = await session.scalars(
        select(Question)
        .where(Question.survey_id == survey.id)
        .order_by(Question.sort_order, Question.created_at)
    )
    return SurveyDetailResponse(
        id=survey.id,
        tenant_id=survey.tenant_id,
        created_by_user_id=survey.created_by_user_id,
        title=survey.title,
        slug=survey.slug,
        description=survey.description,
        default_locale=survey.default_locale,
        status=survey.status,
        questions=[await serialize_question(session, question) for question in questions],
        created_at=survey.created_at,
        updated_at=survey.updated_at,
    )


async def get_question_or_404(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    survey_id: UUID,
    question_id: UUID,
) -> Question:
    question = await session.get(Question, question_id)
    if question is None or question.tenant_id != tenant_id or question.survey_id != survey_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")
    return question


@router.post("", response_model=SurveyResponse, status_code=status.HTTP_201_CREATED)
async def create_survey(
    tenant_id: UUID,
    payload: SurveyCreateRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SurveyResponse:
    require_permission(principal, PermissionCode.SURVEY_CREATE)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)

    survey = Survey(
        tenant_id=tenant_id,
        created_by_user_id=principal.user_id,
        title=payload.title,
        slug=payload.slug,
        description=payload.description,
        default_locale=payload.default_locale,
        status=SurveyStatus.DRAFT,
    )
    session.add(survey)
    try:
        await session.flush()
        await write_audit_log(
            session,
            actor_type=AuditActorType.USER,
            actor_id=str(principal.user_id),
            tenant_id=tenant_id,
            action=AuditAction.TENANT_ACCESS,
            outcome=AuditOutcome.SUCCESS,
            resource_type="survey",
            resource_id=str(survey.id),
            request_id=getattr(request.state, "request_id", None),
            metadata={"operation": "create_survey", "slug": survey.slug},
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Survey slug already exists for this tenant.",
        ) from exc

    await session.refresh(survey)
    return SurveyResponse.model_validate(survey, from_attributes=True)


@router.get("", response_model=list[SurveyResponse])
async def list_surveys(
    tenant_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[SurveyResponse]:
    require_permission(principal, PermissionCode.SURVEY_READ)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)

    survey_query = select(Survey).where(Survey.tenant_id == tenant_id)
    if is_location_scoped(principal):
        scoped_survey_ids = (
            select(SurveyVersion.survey_id)
            .join(FeedbackChannel, FeedbackChannel.survey_version_id == SurveyVersion.id)
            .where(
                FeedbackChannel.tenant_id == tenant_id,
                FeedbackChannel.location_id.in_(principal.location_ids),
            )
        )
        survey_query = survey_query.where(
            (Survey.created_by_user_id == principal.user_id)
            | ((Survey.status == SurveyStatus.PUBLISHED) & Survey.id.in_(scoped_survey_ids))
        )
    surveys = await session.scalars(survey_query.order_by(Survey.created_at.desc()))
    return [SurveyResponse.model_validate(survey, from_attributes=True) for survey in surveys]


@router.get("/versions", response_model=list[SurveyVersionResponse])
async def list_survey_versions(
    tenant_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[SurveyVersionResponse]:
    require_permission(principal, PermissionCode.SURVEY_READ)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)

    version_query = select(SurveyVersion).where(
        SurveyVersion.tenant_id == tenant_id,
        SurveyVersion.status == SurveyVersionStatus.PUBLISHED,
    )
    if is_location_scoped(principal):
        version_query = version_query.join(
            FeedbackChannel,
            FeedbackChannel.survey_version_id == SurveyVersion.id,
        ).where(FeedbackChannel.location_id.in_(principal.location_ids))
    survey_versions = await session.scalars(
        version_query.order_by(SurveyVersion.published_at.desc())
    )
    return [
        SurveyVersionResponse.model_validate(survey_version, from_attributes=True)
        for survey_version in survey_versions
    ]


@router.get("/{survey_id}", response_model=SurveyDetailResponse)
async def get_survey(
    tenant_id: UUID,
    survey_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SurveyDetailResponse:
    require_permission(principal, PermissionCode.SURVEY_READ)
    require_tenant_scope(principal, tenant_id)

    survey = await get_survey_or_404(session, tenant_id=tenant_id, survey_id=survey_id)
    if is_location_scoped(principal) and not can_modify_survey(principal, survey):
        if survey.status != SurveyStatus.PUBLISHED:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Survey not found.")
    return await serialize_survey_detail(session, survey)


@router.patch("/{survey_id}", response_model=SurveyResponse)
async def update_survey(
    tenant_id: UUID,
    survey_id: UUID,
    payload: SurveyUpdateRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SurveyResponse:
    require_permission(principal, PermissionCode.SURVEY_UPDATE)
    require_tenant_scope(principal, tenant_id)
    survey = await get_survey_or_404(session, tenant_id=tenant_id, survey_id=survey_id)
    if payload.status == SurveyStatus.ARCHIVED:
        require_permission(principal, PermissionCode.SURVEY_ARCHIVE)
    else:
        require_survey_owner_or_admin(principal, survey)

    update_data = payload.model_dump(exclude_unset=True)
    if "status" in update_data:
        survey.status = update_data["status"]

    await write_audit_log(
        session,
        actor_type=AuditActorType.USER,
        actor_id=str(principal.user_id),
        tenant_id=tenant_id,
        action=AuditAction.TENANT_ACCESS,
        outcome=AuditOutcome.SUCCESS,
        resource_type="survey",
        resource_id=str(survey.id),
        request_id=getattr(request.state, "request_id", None),
        metadata={
            "operation": "update_survey",
            "fields": sorted(update_data.keys()),
            "status": survey.status.value,
        },
    )
    await session.commit()
    await session.refresh(survey)
    return SurveyResponse.model_validate(survey, from_attributes=True)


@router.post(
    "/{survey_id}/copy",
    response_model=SurveyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def copy_survey(
    tenant_id: UUID,
    survey_id: UUID,
    payload: SurveyCopyRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SurveyResponse:
    require_permission(principal, PermissionCode.SURVEY_COPY)
    require_permission(principal, PermissionCode.SURVEY_READ)
    require_tenant_scope(principal, tenant_id)
    source_survey = await get_survey_or_404(session, tenant_id=tenant_id, survey_id=survey_id)

    copied_survey = Survey(
        tenant_id=tenant_id,
        created_by_user_id=principal.user_id,
        title=payload.title,
        slug=payload.slug,
        description=source_survey.description,
        default_locale=source_survey.default_locale,
        status=SurveyStatus.DRAFT,
    )
    session.add(copied_survey)

    try:
        await session.flush()
        source_questions = await session.scalars(
            select(Question)
            .where(Question.survey_id == source_survey.id)
            .order_by(Question.sort_order, Question.created_at)
        )
        for source_question in source_questions:
            copied_question = Question(
                tenant_id=tenant_id,
                survey_id=copied_survey.id,
                question_key=source_question.question_key,
                question_type=source_question.question_type,
                prompt=source_question.prompt,
                help_text=source_question.help_text,
                is_required=source_question.is_required,
                is_pii=source_question.is_pii,
                sort_order=source_question.sort_order,
                branching_metadata=source_question.branching_metadata,
            )
            session.add(copied_question)
            await session.flush()
            source_options = await session.scalars(
                select(QuestionOption)
                .where(QuestionOption.question_id == source_question.id)
                .order_by(QuestionOption.sort_order, QuestionOption.created_at)
            )
            for source_option in source_options:
                session.add(
                    QuestionOption(
                        tenant_id=tenant_id,
                        question_id=copied_question.id,
                        value=source_option.value,
                        label=source_option.label,
                        sort_order=source_option.sort_order,
                    )
                )

        await write_audit_log(
            session,
            actor_type=AuditActorType.USER,
            actor_id=str(principal.user_id),
            tenant_id=tenant_id,
            action=AuditAction.TENANT_ACCESS,
            outcome=AuditOutcome.SUCCESS,
            resource_type="survey",
            resource_id=str(copied_survey.id),
            request_id=getattr(request.state, "request_id", None),
            metadata={
                "operation": "copy_survey",
                "source_survey_id": str(source_survey.id),
                "slug": copied_survey.slug,
            },
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Survey slug already exists for this tenant.",
        ) from exc

    await session.refresh(copied_survey)
    return SurveyResponse.model_validate(copied_survey, from_attributes=True)


@router.post(
    "/{survey_id}/questions",
    response_model=QuestionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_question(
    tenant_id: UUID,
    survey_id: UUID,
    payload: QuestionCreateRequest,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> QuestionResponse:
    require_permission(principal, PermissionCode.SURVEY_UPDATE)
    require_tenant_scope(principal, tenant_id)
    survey = await get_survey_or_404(session, tenant_id=tenant_id, survey_id=survey_id)
    require_survey_owner_or_admin(principal, survey)
    if survey.status == SurveyStatus.ARCHIVED:
        raise HTTPException(status_code=422, detail="Cannot update an archived survey.")

    question = Question(
        tenant_id=tenant_id,
        survey_id=survey_id,
        question_key=payload.question_key,
        question_type=payload.question_type,
        prompt=payload.prompt,
        help_text=payload.help_text,
        is_required=payload.is_required,
        is_pii=payload.is_pii,
        sort_order=payload.sort_order,
        branching_metadata=payload.branching_metadata,
    )
    session.add(question)
    if survey.status == SurveyStatus.PUBLISHED:
        survey.status = SurveyStatus.DRAFT

    try:
        await session.flush()
        for option_payload in payload.options:
            session.add(
                QuestionOption(
                    tenant_id=tenant_id,
                    question_id=question.id,
                    value=option_payload.value,
                    label=option_payload.label,
                    sort_order=option_payload.sort_order,
                )
            )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Question key or option value already exists.",
        ) from exc

    await session.refresh(question)
    return await serialize_question(session, question)


@router.patch(
    "/{survey_id}/questions/{question_id}",
    response_model=QuestionResponse,
)
async def update_question(
    tenant_id: UUID,
    survey_id: UUID,
    question_id: UUID,
    payload: QuestionUpdateRequest,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> QuestionResponse:
    require_permission(principal, PermissionCode.SURVEY_UPDATE)
    require_tenant_scope(principal, tenant_id)
    survey = await get_survey_or_404(session, tenant_id=tenant_id, survey_id=survey_id)
    require_survey_owner_or_admin(principal, survey)
    if survey.status == SurveyStatus.ARCHIVED:
        raise HTTPException(status_code=422, detail="Cannot update an archived survey.")

    question = await get_question_or_404(
        session,
        tenant_id=tenant_id,
        survey_id=survey_id,
        question_id=question_id,
    )
    update_data = payload.model_dump(exclude_unset=True)
    options_payload = update_data.pop("options", None)
    next_question_type = update_data.get("question_type", question.question_type)
    if next_question_type in {
        QuestionType.SINGLE_SELECTION,
        QuestionType.MULTI_SELECTION,
        QuestionType.DROPDOWN,
    } and options_payload == []:
        raise HTTPException(status_code=422, detail="This question type requires options.")

    for field_name, value in update_data.items():
        setattr(question, field_name, value)
    if survey.status == SurveyStatus.PUBLISHED:
        survey.status = SurveyStatus.DRAFT

    try:
        if options_payload is not None:
            existing_options = await session.scalars(
                select(QuestionOption).where(QuestionOption.question_id == question.id)
            )
            for option in existing_options:
                await session.delete(option)
            await session.flush()
            for option_payload in options_payload:
                session.add(
                    QuestionOption(
                        tenant_id=tenant_id,
                        question_id=question.id,
                        value=option_payload["value"],
                        label=option_payload["label"],
                        sort_order=option_payload["sort_order"],
                    )
                )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Question key or option value already exists.",
        ) from exc

    await session.refresh(question)
    return await serialize_question(session, question)


@router.post("/{survey_id}/publish", response_model=SurveyVersionResponse)
async def publish_survey(
    tenant_id: UUID,
    survey_id: UUID,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SurveyVersionResponse:
    require_permission(principal, PermissionCode.SURVEY_PUBLISH)
    require_tenant_scope(principal, tenant_id)
    survey = await get_survey_or_404(session, tenant_id=tenant_id, survey_id=survey_id)
    require_survey_owner_or_admin(principal, survey)

    try:
        version = await publish_survey_version(
            session,
            survey=survey,
            published_by_user_id=principal.user_id,
        )
        await write_audit_log(
            session,
            actor_type=AuditActorType.USER,
            actor_id=str(principal.user_id),
            tenant_id=tenant_id,
            action=AuditAction.SURVEY_PUBLISHED,
            outcome=AuditOutcome.SUCCESS,
            resource_type="survey_version",
            resource_id=str(version.id),
            request_id=getattr(request.state, "request_id", None),
            metadata={"survey_id": str(survey_id), "version_number": version.version_number},
        )
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    await session.refresh(version)
    return SurveyVersionResponse.model_validate(version, from_attributes=True)
