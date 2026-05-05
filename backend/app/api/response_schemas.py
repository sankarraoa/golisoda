from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ResponseAnswerRead(BaseModel):
    question_key: str
    question_type: str
    value: object | None
    is_pii: bool


class FeedbackResponseRead(BaseModel):
    id: UUID
    tenant_id: UUID
    channel_id: UUID
    channel_name: str
    location_id: UUID
    location_name: str
    survey_version_id: UUID
    locale: str
    submitted_at: datetime
    answers: list[ResponseAnswerRead]


class AnalyticsSummaryResponse(BaseModel):
    total_responses: int
    nps_average: float | None
    csat_average: float | None
    active_channels: int
