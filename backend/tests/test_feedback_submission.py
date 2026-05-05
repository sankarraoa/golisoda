import pytest
from fastapi import HTTPException

from app.services.feedback_submission import hash_idempotency_key, validate_public_answers


def test_validate_public_answers_accepts_snapshot_shape() -> None:
    answers = validate_public_answers(
        schema_snapshot=_snapshot(),
        submitted_answers=[
            {"question_key": "nps", "value": 9},
            {"question_key": "visit_reason", "value": "food"},
            {"question_key": "comments", "value": "Great service"},
        ],
    )

    assert answers == [
        {"question_key": "nps", "question_type": "nps", "value": 9, "is_pii": False},
        {
            "question_key": "visit_reason",
            "question_type": "single_selection",
            "value": "food",
            "is_pii": False,
        },
        {
            "question_key": "comments",
            "question_type": "plain_text",
            "value": "Great service",
            "is_pii": False,
        },
    ]


def test_validate_public_answers_rejects_missing_required_answer() -> None:
    with pytest.raises(HTTPException) as exc_info:
        validate_public_answers(
            schema_snapshot=_snapshot(),
            submitted_answers=[{"question_key": "visit_reason", "value": "food"}],
        )

    assert exc_info.value.status_code == 422


def test_validate_public_answers_rejects_invalid_option() -> None:
    with pytest.raises(HTTPException) as exc_info:
        validate_public_answers(
            schema_snapshot=_snapshot(),
            submitted_answers=[
                {"question_key": "nps", "value": 9},
                {"question_key": "visit_reason", "value": "competitor"},
            ],
        )

    assert exc_info.value.status_code == 422


def test_hash_idempotency_key_is_channel_scoped() -> None:
    first_hash = hash_idempotency_key("abc123", "retry-1")
    second_hash = hash_idempotency_key("def456", "retry-1")

    assert first_hash != second_hash
    assert first_hash == hash_idempotency_key("abc123", "retry-1")


def _snapshot() -> dict:
    return {
        "survey": {"title": "Visit feedback"},
        "questions": [
            {
                "question_key": "nps",
                "question_type": "nps",
                "is_required": True,
                "is_pii": False,
                "options": [],
            },
            {
                "question_key": "visit_reason",
                "question_type": "single_selection",
                "is_required": False,
                "is_pii": False,
                "options": [
                    {"value": "food", "label": "Food"},
                    {"value": "service", "label": "Service"},
                ],
            },
            {
                "question_key": "comments",
                "question_type": "plain_text",
                "is_required": False,
                "is_pii": False,
                "options": [],
            },
        ],
    }
