from io import BytesIO
from typing import Annotated
from uuid import UUID

import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.channel_schemas import (
    ChannelCopyRequest,
    ChannelCreateRequest,
    ChannelResponse,
    ChannelUpdateRequest,
)
from app.auth.authorization import require_permission, require_tenant_scope
from app.auth.dependencies import get_current_principal
from app.auth.principal import Principal
from app.core.config import get_settings
from app.core.database import get_session
from app.models.channel import FeedbackChannel
from app.models.enums import (
    AuditAction,
    AuditActorType,
    AuditOutcome,
    ChannelStatus,
    PermissionCode,
    SurveyVersionStatus,
)
from app.models.survey import SurveyVersion
from app.models.tenant import Location, Tenant
from app.services.audit import write_audit_log
from app.services.channels import generate_unique_channel_code

router = APIRouter(prefix="/tenants/{tenant_id}/channels", tags=["channels"])


async def get_tenant_or_404(session: AsyncSession, tenant_id: UUID) -> Tenant:
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    return tenant


async def get_location_or_404(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    location_id: UUID,
) -> Location:
    location = await session.get(Location, location_id)
    if location is None or location.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found.")
    return location


async def get_survey_version_or_404(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    survey_version_id: UUID,
) -> SurveyVersion:
    survey_version = await session.get(SurveyVersion, survey_version_id)
    if (
        survey_version is None
        or survey_version.tenant_id != tenant_id
        or survey_version.status != SurveyVersionStatus.PUBLISHED
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Published survey version not found.",
        )
    return survey_version


async def get_channel_or_404(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    channel_id: UUID,
) -> FeedbackChannel:
    channel = await session.get(FeedbackChannel, channel_id)
    if channel is None or channel.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found.")
    return channel


def public_feedback_url(channel: FeedbackChannel) -> str:
    settings = get_settings()
    return f"{settings.public_feedback_base_url.rstrip('/')}/f/{channel.channel_code}"


def is_location_scoped(principal: Principal) -> bool:
    return len(principal.location_ids) > 0


def require_channel_location_scope(principal: Principal, channel: FeedbackChannel) -> None:
    if is_location_scoped(principal) and channel.location_id not in principal.location_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found.")


def serialize_channel(channel: FeedbackChannel) -> ChannelResponse:
    return ChannelResponse(
        id=channel.id,
        tenant_id=channel.tenant_id,
        location_id=channel.location_id,
        survey_version_id=channel.survey_version_id,
        name=channel.name,
        channel_code=channel.channel_code,
        channel_type=channel.channel_type,
        status=channel.status,
        qr_url=channel.qr_url,
        metadata=channel.metadata_json,
        created_at=channel.created_at,
        updated_at=channel.updated_at,
    )


@router.post("", response_model=ChannelResponse, status_code=status.HTTP_201_CREATED)
async def create_channel(
    tenant_id: UUID,
    payload: ChannelCreateRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ChannelResponse:
    require_permission(principal, PermissionCode.CHANNEL_CREATE)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)
    await get_location_or_404(session, tenant_id=tenant_id, location_id=payload.location_id)
    if is_location_scoped(principal) and payload.location_id not in principal.location_ids:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found.")
    await get_survey_version_or_404(
        session,
        tenant_id=tenant_id,
        survey_version_id=payload.survey_version_id,
    )

    channel_code = await generate_unique_channel_code(session)
    channel = FeedbackChannel(
        tenant_id=tenant_id,
        location_id=payload.location_id,
        survey_version_id=payload.survey_version_id,
        name=payload.name,
        channel_code=channel_code,
        channel_type=payload.channel_type,
        status=ChannelStatus.ACTIVE,
        qr_url=f"/f/{channel_code}",
        metadata_json=payload.metadata,
    )
    session.add(channel)
    try:
        await session.flush()
        await write_audit_log(
            session,
            actor_type=AuditActorType.USER,
            actor_id=str(principal.user_id),
            tenant_id=tenant_id,
            action=AuditAction.CHANNEL_CREATED,
            outcome=AuditOutcome.SUCCESS,
            resource_type="feedback_channel",
            resource_id=str(channel.id),
            request_id=getattr(request.state, "request_id", None),
            metadata={
                "location_id": str(channel.location_id),
                "survey_version_id": str(channel.survey_version_id),
            },
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Channel name or code already exists.",
        ) from exc

    await session.refresh(channel)
    return serialize_channel(channel)


@router.get("", response_model=list[ChannelResponse])
async def list_channels(
    tenant_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[ChannelResponse]:
    require_permission(principal, PermissionCode.CHANNEL_READ)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)

    channel_query = select(FeedbackChannel).where(FeedbackChannel.tenant_id == tenant_id)
    if is_location_scoped(principal):
        channel_query = channel_query.where(FeedbackChannel.location_id.in_(principal.location_ids))
    channels = await session.scalars(channel_query.order_by(FeedbackChannel.created_at.desc()))
    return [serialize_channel(channel) for channel in channels]


@router.patch("/{channel_id}", response_model=ChannelResponse)
async def update_channel(
    tenant_id: UUID,
    channel_id: UUID,
    payload: ChannelUpdateRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ChannelResponse:
    require_permission(principal, PermissionCode.CHANNEL_UPDATE)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)
    channel = await get_channel_or_404(session, tenant_id=tenant_id, channel_id=channel_id)
    require_channel_location_scope(principal, channel)

    if payload.location_id is not None:
        await get_location_or_404(session, tenant_id=tenant_id, location_id=payload.location_id)
        if is_location_scoped(principal) and payload.location_id not in principal.location_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found.")
        channel.location_id = payload.location_id
    if payload.survey_version_id is not None:
        await get_survey_version_or_404(
            session,
            tenant_id=tenant_id,
            survey_version_id=payload.survey_version_id,
        )
        channel.survey_version_id = payload.survey_version_id
    if payload.name is not None:
        channel.name = payload.name
    if payload.channel_type is not None:
        channel.channel_type = payload.channel_type
    if payload.status is not None:
        if payload.status == ChannelStatus.DISABLED:
            require_permission(principal, PermissionCode.CHANNEL_ARCHIVE)
        channel.status = payload.status
    if payload.metadata is not None:
        channel.metadata_json = payload.metadata

    await write_audit_log(
        session,
        actor_type=AuditActorType.USER,
        actor_id=str(principal.user_id),
        tenant_id=tenant_id,
        action=AuditAction.TENANT_ACCESS,
        outcome=AuditOutcome.SUCCESS,
        resource_type="feedback_channel",
        resource_id=str(channel.id),
        request_id=getattr(request.state, "request_id", None),
        metadata={"operation": "update_channel"},
    )
    await session.commit()
    await session.refresh(channel)
    return serialize_channel(channel)


@router.post(
    "/{channel_id}/copy",
    response_model=ChannelResponse,
    status_code=status.HTTP_201_CREATED,
)
async def copy_channel(
    tenant_id: UUID,
    channel_id: UUID,
    payload: ChannelCopyRequest,
    request: Request,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ChannelResponse:
    require_permission(principal, PermissionCode.CHANNEL_CREATE)
    require_permission(principal, PermissionCode.CHANNEL_READ)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)
    source_channel = await get_channel_or_404(session, tenant_id=tenant_id, channel_id=channel_id)
    require_channel_location_scope(principal, source_channel)

    channel_code = await generate_unique_channel_code(session)
    copied_channel = FeedbackChannel(
        tenant_id=tenant_id,
        location_id=source_channel.location_id,
        survey_version_id=source_channel.survey_version_id,
        name=payload.name,
        channel_code=channel_code,
        channel_type=source_channel.channel_type,
        status=ChannelStatus.ACTIVE,
        qr_url=f"/f/{channel_code}",
        metadata_json=source_channel.metadata_json,
    )
    session.add(copied_channel)
    await session.flush()
    await write_audit_log(
        session,
        actor_type=AuditActorType.USER,
        actor_id=str(principal.user_id),
        tenant_id=tenant_id,
        action=AuditAction.CHANNEL_CREATED,
        outcome=AuditOutcome.SUCCESS,
        resource_type="feedback_channel",
        resource_id=str(copied_channel.id),
        request_id=getattr(request.state, "request_id", None),
        metadata={"operation": "copy_channel", "source_channel_id": str(source_channel.id)},
    )
    await session.commit()
    await session.refresh(copied_channel)
    return serialize_channel(copied_channel)


@router.get("/{channel_id}/qr.png", response_class=Response)
async def download_channel_qr_png(
    tenant_id: UUID,
    channel_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    require_permission(principal, PermissionCode.CHANNEL_READ)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)
    channel = await get_channel_or_404(session, tenant_id=tenant_id, channel_id=channel_id)
    require_channel_location_scope(principal, channel)

    qr_image = qrcode.make(public_feedback_url(channel))
    output = BytesIO()
    qr_image.save(output, format="PNG")
    return Response(
        content=output.getvalue(),
        media_type="image/png",
        headers={
            "Content-Disposition": f'attachment; filename="{channel.channel_code}.png"',
        },
    )


@router.get("/{channel_id}/qr.svg", response_class=Response)
async def download_channel_qr_svg(
    tenant_id: UUID,
    channel_id: UUID,
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    require_permission(principal, PermissionCode.CHANNEL_READ)
    require_tenant_scope(principal, tenant_id)
    await get_tenant_or_404(session, tenant_id)
    channel = await get_channel_or_404(session, tenant_id=tenant_id, channel_id=channel_id)
    require_channel_location_scope(principal, channel)

    qr_image = qrcode.make(public_feedback_url(channel), image_factory=qrcode.image.svg.SvgImage)
    output = BytesIO()
    qr_image.save(output)
    return Response(
        content=output.getvalue(),
        media_type="image/svg+xml",
        headers={
            "Content-Disposition": f'attachment; filename="{channel.channel_code}.svg"',
        },
    )
