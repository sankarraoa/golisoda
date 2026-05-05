import pytest
from pydantic import ValidationError

from app.api.survey_schemas import QuestionCreateRequest
from app.models.enums import QuestionType


def test_option_question_requires_options() -> None:
    with pytest.raises(ValidationError):
        QuestionCreateRequest(
            question_key="favorite_item",
            question_type=QuestionType.SINGLE_SELECTION,
            prompt="Favorite item?",
        )


def test_plain_text_rejects_options() -> None:
    with pytest.raises(ValidationError):
        QuestionCreateRequest(
            question_key="comment",
            question_type=QuestionType.PLAIN_TEXT,
            prompt="Any comments?",
            options=[{"value": "yes", "label": "Yes"}],
        )


def test_nps_question_without_options_is_valid() -> None:
    question = QuestionCreateRequest(
        question_key="nps",
        question_type=QuestionType.NPS,
        prompt="How likely are you to recommend us?",
    )

    assert question.question_type == QuestionType.NPS
    assert question.options == []
