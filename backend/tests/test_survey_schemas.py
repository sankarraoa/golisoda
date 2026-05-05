import pytest
from pydantic import ValidationError

from app.api.survey_schemas import QuestionCreateRequest, QuestionOptionCreateRequest
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


@pytest.mark.parametrize(
    ("qtype",),
    [
        (QuestionType.SHORT_TEXT,),
        (QuestionType.PHONE,),
        (QuestionType.EMAIL,),
    ],
)
def test_freeform_question_types_reject_options(qtype: QuestionType) -> None:
    with pytest.raises(ValidationError):
        QuestionCreateRequest(
            question_key="x",
            question_type=qtype,
            prompt="?",
            options=[{"value": "a", "label": "A"}],
        )


def test_nps_question_without_options_is_valid() -> None:
    question = QuestionCreateRequest(
        question_key="nps",
        question_type=QuestionType.NPS,
        prompt="How likely are you to recommend us?",
    )

    assert question.question_type == QuestionType.NPS
    assert question.options == []


def test_csat_5_without_options() -> None:
    q = QuestionCreateRequest(
        question_key="mood",
        question_type=QuestionType.CSAT_5,
        prompt="How did we do?",
    )
    assert q.options == []


def test_csat_5_with_five_ordered_options() -> None:
    QuestionCreateRequest(
        question_key="mood",
        question_type=QuestionType.CSAT_5,
        prompt="How did we do?",
        options=[
            QuestionOptionCreateRequest(value="1", label="Terrible", sort_order=4),
            QuestionOptionCreateRequest(value="2", label="Poor", sort_order=2),
            QuestionOptionCreateRequest(value="3", label="Okay", sort_order=0),
            QuestionOptionCreateRequest(value="4", label="Nice", sort_order=1),
            QuestionOptionCreateRequest(value="5", label="Amazing", sort_order=3),
        ],
    )


def test_csat_5_rejects_bad_option_value() -> None:
    with pytest.raises(ValidationError):
        QuestionCreateRequest(
            question_key="mood",
            question_type=QuestionType.CSAT_5,
            prompt="How did we do?",
            options=[
                QuestionOptionCreateRequest(value="10", label="Bad", sort_order=0),
                QuestionOptionCreateRequest(value="2", label="B", sort_order=1),
                QuestionOptionCreateRequest(value="3", label="C", sort_order=2),
                QuestionOptionCreateRequest(value="4", label="D", sort_order=3),
                QuestionOptionCreateRequest(value="5", label="E", sort_order=4),
            ],
        )


def test_csat_2_rejects_options() -> None:
    with pytest.raises(ValidationError):
        QuestionCreateRequest(
            question_key="like",
            question_type=QuestionType.CSAT_2,
            prompt="Rate us",
            options=[QuestionOptionCreateRequest(value="up", label="Yes", sort_order=0)],
        )


def test_csat_5_rejects_freeform_single_option_line() -> None:
    with pytest.raises(ValidationError):
        QuestionCreateRequest(
            question_key="x",
            question_type=QuestionType.CSAT_5,
            prompt="?",
            options=[QuestionOptionCreateRequest(value="n", label="No", sort_order=0)],
        )
