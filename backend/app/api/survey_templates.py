from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.survey_template_schemas import SurveyTemplateResponse
from app.auth.authorization import has_permission
from app.auth.dependencies import get_current_principal
from app.auth.principal import Principal
from app.core.database import get_session
from app.models.enums import PermissionCode
from app.models.survey_template import SurveyTemplate
from app.schemas.survey_presentation import parse_presentation

router = APIRouter(prefix="/survey-templates", tags=["survey-templates"])


@router.get("", response_model=list[SurveyTemplateResponse])
async def list_survey_templates(
    principal: Annotated[Principal, Depends(get_current_principal)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[SurveyTemplateResponse]:
    if not (
        has_permission(principal, PermissionCode.SURVEY_READ)
        or has_permission(principal, PermissionCode.CHANNEL_READ)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing permission: survey:read or channel:read.",
        )

    templates = (
        await session.scalars(
            select(SurveyTemplate)
            .where(SurveyTemplate.is_active.is_(True))
            .order_by(SurveyTemplate.sort_order.asc(), SurveyTemplate.slug.asc())
        )
    ).all()
    return [
        SurveyTemplateResponse(
            id=row.id,
            slug=row.slug,
            name=row.name,
            description=row.description,
            deployment_notes=row.deployment_notes,
            presentation=parse_presentation(row.presentation),
            sort_order=row.sort_order,
            is_active=row.is_active,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in templates
    ]
