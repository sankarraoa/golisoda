from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.channel_schemas import (
    PublicBrandingResponse,
    PublicFeedbackContextResponse,
    PublicLocationResponse,
    PublicSubmitRequest,
    PublicSubmitResponse,
)
from app.core.database import get_session
from app.models.channel import FeedbackChannel
from app.models.enums import ChannelStatus, TenantStatus
from app.models.survey import SurveyVersion
from app.models.tenant import Location, Tenant, TenantBranding
from app.services.feedback_submission import enqueue_public_submission, validate_public_answers

router = APIRouter(tags=["public"])


@router.get("/public/{channel_code}", response_model=PublicFeedbackContextResponse)
@router.get("/f/{channel_code}", response_model=PublicFeedbackContextResponse)
async def get_public_feedback_context(
    channel_code: str,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PublicFeedbackContextResponse:
    channel = await session.scalar(
        select(FeedbackChannel).where(FeedbackChannel.channel_code == channel_code)
    )
    if channel is None or channel.status != ChannelStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found.")

    tenant = await session.get(Tenant, channel.tenant_id)
    if tenant is None or tenant.status != TenantStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant is not active.")

    location = await session.get(Location, channel.location_id)
    survey_version = await session.get(SurveyVersion, channel.survey_version_id)
    branding = await session.scalar(
        select(TenantBranding).where(TenantBranding.tenant_id == channel.tenant_id)
    )
    if location is None or survey_version is None or branding is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Channel context missing.",
        )

    snapshot = survey_version.schema_snapshot
    return PublicFeedbackContextResponse(
        channel_code=channel.channel_code,
        tenant_id=channel.tenant_id,
        location=PublicLocationResponse(
            id=location.id,
            name=location.name,
            city=location.city,
            region=location.region,
        ),
        branding=PublicBrandingResponse(
            logo_url=branding.logo_url,
            primary_color=branding.primary_color,
            secondary_color=branding.secondary_color,
            thank_you_text=branding.thank_you_text,
        ),
        survey_version_id=survey_version.id,
        survey=snapshot["survey"],
        questions=snapshot["questions"],
    )

@router.post("/public/{channel_code}/submit", response_model=PublicSubmitResponse, status_code=202)
@router.post("/f/{channel_code}/submit", response_model=PublicSubmitResponse, status_code=202)
async def submit_public_feedback(
    channel_code: str,
    request_body: PublicSubmitRequest,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> PublicSubmitResponse:
    channel = await session.scalar(
        select(FeedbackChannel).where(FeedbackChannel.channel_code == channel_code)
    )
    if channel is None or channel.status != ChannelStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found.")

    tenant = await session.get(Tenant, channel.tenant_id)
    if tenant is None or tenant.status != TenantStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant is not active.")

    survey_version = await session.get(SurveyVersion, channel.survey_version_id)
    branding = await session.scalar(
        select(TenantBranding).where(TenantBranding.tenant_id == channel.tenant_id)
    )
    if survey_version is None or branding is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Channel context missing.",
        )

    submitted_answers = [answer.model_dump(mode="json") for answer in request_body.answers]
    validated_answers = validate_public_answers(
        schema_snapshot=survey_version.schema_snapshot,
        submitted_answers=submitted_answers,
    )
    payload = {
        "locale": request_body.locale,
        "answers": validated_answers,
        "metadata": request_body.metadata,
    }
    await enqueue_public_submission(
        session=session,
        channel=channel,
        channel_code=channel_code,
        payload=payload,
        request_id=request.headers.get("x-request-id"),
        idempotency_key=idempotency_key,
    )

    return PublicSubmitResponse(submitted=True, thank_you_text=branding.thank_you_text)
