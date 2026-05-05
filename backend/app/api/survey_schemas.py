from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.enums import QuestionType, SurveyStatus, SurveyVersionStatus

OPTION_QUESTION_TYPES = {
    QuestionType.SINGLE_SELECTION,
    QuestionType.MULTI_SELECTION,
    QuestionType.DROPDOWN,
}

SCALE_CAPTION_QUESTION_TYPES = frozenset(
    {
        QuestionType.CSAT_5,
        QuestionType.CSAT_4,
        QuestionType.CSAT_2,
    }
)

SCALE_CAPTION_LABEL_COUNTS: dict[QuestionType, int] = {
    QuestionType.CSAT_5: 5,
    QuestionType.CSAT_4: 4,
    QuestionType.CSAT_2: 2,
}


class SurveyCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$")
    description: str | None = None
    default_locale: str = Field(default="en", min_length=2, max_length=16)


class SurveyUpdateRequest(BaseModel):
    status: SurveyStatus | None = None


class SurveyCopyRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$")


class SurveyResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    created_by_user_id: UUID | None = None
    title: str
    slug: str
    description: str | None
    default_locale: str
    status: SurveyStatus
    created_at: datetime
    updated_at: datetime


class QuestionOptionCreateRequest(BaseModel):
    value: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1)
    sort_order: int = 0


def _validate_question_options(
    question_type: QuestionType,
    options: list[QuestionOptionCreateRequest],
) -> None:
    if question_type in OPTION_QUESTION_TYPES:
        if not options:
            raise ValueError(f"{question_type.value} requires at least one option.")
        return
    if question_type in SCALE_CAPTION_QUESTION_TYPES:
        if not options:
            return
        expected = SCALE_CAPTION_LABEL_COUNTS[question_type]
        if len(options) != expected:
            raise ValueError(
                f"{question_type.value} accepts no options (default captions) or exactly "
                f"{expected} options with values '1' through '{expected}'."
            )
        value_set = {opt.value for opt in options}
        required_values = {str(index) for index in range(1, expected + 1)}
        if value_set != required_values:
            raise ValueError(
                f"{question_type.value} options must use values {sorted(required_values, key=int)}."
            )
        return
    if question_type in {
        QuestionType.PLAIN_TEXT,
        QuestionType.SHORT_TEXT,
        QuestionType.PHONE,
        QuestionType.EMAIL,
    } and options:
        raise ValueError(f"{question_type.value} does not accept options.")
    if options:
        raise ValueError(f"{question_type.value} does not accept options.")


class QuestionCreateRequest(BaseModel):
    question_key: str = Field(pattern=r"^[a-zA-Z0-9_:-]{1,120}$")
    question_type: QuestionType
    prompt: str = Field(min_length=1)
    help_text: str | None = None
    is_required: bool = True
    is_pii: bool = False
    sort_order: int = 0
    branching_metadata: dict = Field(default_factory=dict)
    options: list[QuestionOptionCreateRequest] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_options(self) -> "QuestionCreateRequest":
        _validate_question_options(self.question_type, self.options)
        return self


class QuestionUpdateRequest(BaseModel):
    question_key: str | None = Field(default=None, pattern=r"^[a-zA-Z0-9_:-]{1,120}$")
    question_type: QuestionType | None = None
    prompt: str | None = Field(default=None, min_length=1)
    help_text: str | None = None
    is_required: bool | None = None
    is_pii: bool | None = None
    sort_order: int | None = None
    branching_metadata: dict | None = None
    options: list[QuestionOptionCreateRequest] | None = None

    @model_validator(mode="after")
    def validate_options(self) -> "QuestionUpdateRequest":
        if self.options is None:
            return self
        if self.question_type is None:
            raise ValueError("question_type is required when updating options.")
        _validate_question_options(self.question_type, self.options)
        return self


class QuestionOptionResponse(BaseModel):
    id: UUID
    value: str
    label: str
    sort_order: int


class QuestionResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    survey_id: UUID
    question_key: str
    question_type: QuestionType
    prompt: str
    help_text: str | None
    is_required: bool
    is_pii: bool
    sort_order: int
    branching_metadata: dict
    options: list[QuestionOptionResponse] = []
    created_at: datetime
    updated_at: datetime


class SurveyDetailResponse(SurveyResponse):
    questions: list[QuestionResponse] = []


class SurveyVersionResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    survey_id: UUID
    version_number: int
    status: SurveyVersionStatus
    schema_snapshot: dict
    published_at: datetime
    published_by_user_id: UUID | None
    created_at: datetime
    updated_at: datetime
