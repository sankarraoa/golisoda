from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ResponseAnswerRead(BaseModel):
    question_key: str
    question_type: str
    value: object | None
    is_pii: bool


class ResponseQuestionDefinition(BaseModel):
    question_key: str
    question_type: str
    prompt: str
    sort_order: int
    options: list[dict]


class FeedbackResponseRead(BaseModel):
    id: UUID
    tenant_id: UUID
    channel_id: UUID
    channel_name: str
    location_id: UUID
    location_name: str
    survey_id: UUID
    survey_title: str
    survey_version_id: UUID
    survey_version_number: int
    locale: str
    submitted_at: datetime
    answers: list[ResponseAnswerRead]
    question_definitions: list[ResponseQuestionDefinition]


class FeedbackResponseListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[FeedbackResponseRead]


class DistributionBucket(BaseModel):
    value: float | int
    count: int


class ChoiceCountRow(BaseModel):
    value: str
    label: str | None = None
    count: int


class QuestionAggregateRead(BaseModel):
    question_key: str
    question_type: str
    prompt: str
    sort_order: int
    answered_count: int
    cohort_response_count: int
    average: float | None = None
    min_value: float | None = None
    max_value: float | None = None
    distribution: list[DistributionBucket] = []
    choice_counts: list[ChoiceCountRow] = []
    text_sample_count: int = 0
    text_samples: list[str] = []


class VersionCohortAggregateRead(BaseModel):
    survey_version_id: UUID
    survey_id: UUID
    survey_title: str
    version_number: int
    response_count: int
    questions: list[QuestionAggregateRead]


class ResponseAggregateReport(BaseModel):
    channel_id: UUID | None = None
    channel_name: str = "All channels"
    submitted_after: datetime | None = None
    submitted_before: datetime | None = None
    cohorts: list[VersionCohortAggregateRead]


class NpsSnapshotBlock(BaseModel):
    response_count: int
    promoters_pct: float
    passives_pct: float
    detractors_pct: float
    nps: int | None


class NpsTrendMonth(BaseModel):
    year: int
    month: int
    label: str
    response_count: int
    promoters_pct: float
    passives_pct: float
    detractors_pct: float
    nps: int | None


class NpsDashboardResponse(BaseModel):
    question_key: str
    prompt: str
    reporting_period_label: str
    snapshot: NpsSnapshotBlock
    nps_delta_vs_period_start: int | None = None
    months: list[NpsTrendMonth]


class Csat2SnapshotBlock(BaseModel):
    yes_count: int
    no_count: int
    answered_count: int
    cohort_response_count: int
    csat_pct: float | None = None
    response_rate_pct: float


class Csat2TrendMonth(BaseModel):
    year: int
    month: int
    label: str
    response_count: int
    yes_count: int
    csat_pct: float | None = None


class Csat2DashboardResponse(BaseModel):
    question_key: str
    prompt: str
    reporting_period_label: str
    snapshot: Csat2SnapshotBlock
    months: list[Csat2TrendMonth]


class AnalyticsSummaryResponse(BaseModel):
    total_responses: int
    nps_average: float | None
    csat_average: float | None
    active_channels: int
