from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.survey_presentation import SurveyPresentationConfig


class SurveyTemplateResponse(BaseModel):
    id: UUID
    slug: str
    name: str
    description: str | None
    deployment_notes: str | None
    presentation: SurveyPresentationConfig
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
