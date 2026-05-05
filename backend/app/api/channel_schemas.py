from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import ChannelStatus, ChannelType
from app.schemas.survey_presentation import SurveyPresentationConfig


class ChannelCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    location_id: UUID
    survey_version_id: UUID
    survey_template_id: UUID
    channel_type: ChannelType = ChannelType.QR
    metadata: dict = Field(default_factory=dict)


class ChannelUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    location_id: UUID | None = None
    survey_version_id: UUID | None = None
    survey_template_id: UUID | None = None
    channel_type: ChannelType | None = None
    status: ChannelStatus | None = None
    metadata: dict | None = None


class ChannelCopyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class ChannelResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    location_id: UUID
    survey_version_id: UUID
    survey_template_id: UUID
    name: str
    channel_code: str
    channel_type: ChannelType
    status: ChannelStatus
    qr_url: str | None
    metadata: dict
    created_at: datetime
    updated_at: datetime


class PublicBrandingResponse(BaseModel):
    logo_url: str | None
    primary_color: str | None
    secondary_color: str | None
    thank_you_text: str


class PublicLocationResponse(BaseModel):
    id: UUID
    name: str
    city: str | None
    region: str | None


class PublicSurveyTemplatePayload(BaseModel):
    id: UUID
    slug: str
    name: str
    presentation: SurveyPresentationConfig


class PublicFeedbackContextResponse(BaseModel):
    channel_code: str
    tenant_id: UUID
    location: PublicLocationResponse
    branding: PublicBrandingResponse
    survey_version_id: UUID
    survey: dict
    questions: list[dict]
    template: PublicSurveyTemplatePayload


class PublicAnswerRequest(BaseModel):
    question_key: str
    value: Any


class PublicSubmitRequest(BaseModel):
    locale: str = Field(default="en", min_length=2, max_length=16)
    answers: list[PublicAnswerRequest] = Field(min_length=1)
    metadata: dict = Field(default_factory=dict)


class PublicSubmitResponse(BaseModel):
    submitted: bool
    thank_you_text: str
