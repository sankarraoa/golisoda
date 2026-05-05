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


def test_validate_public_answers_accepts_csat_2_and_csat_5() -> None:
    snapshot = {
        "survey": {"title": "Pulse"},
        "questions": [
            {
                "question_key": "q1",
                "question_type": "csat_2",
                "is_required": True,
                "is_pii": False,
                "options": [],
            },
            {
                "question_key": "q2",
                "question_type": "csat_5",
                "is_required": True,
                "is_pii": False,
                "options": [],
            },
        ],
    }
    validated = validate_public_answers(
        schema_snapshot=snapshot,
        submitted_answers=[
            {"question_key": "q1", "value": 1},
            {"question_key": "q2", "value": 4},
        ],
    )
    assert validated[0]["value"] == 1
    assert validated[1]["value"] == 4


def test_validate_public_answers_csat_2_bounds() -> None:
    snapshot = {
        "survey": {"title": "Pulse"},
        "questions": [
            {
                "question_key": "q1",
                "question_type": "csat_2",
                "is_required": True,
                "is_pii": False,
                "options": [],
            }
        ],
    }
    with pytest.raises(HTTPException) as exc:
        validate_public_answers(
            schema_snapshot=snapshot,
            submitted_answers=[{"question_key": "q1", "value": 5}],
        )
    assert exc.value.status_code == 422


def test_validate_public_answers_normalizes_phone_and_email() -> None:
    validated = validate_public_answers(
        schema_snapshot={
            "survey": {"title": "Contact"},
            "questions": [
                {
                    "question_key": "p",
                    "question_type": "phone",
                    "is_required": True,
                    "is_pii": True,
                    "options": [],
                },
                {
                    "question_key": "e",
                    "question_type": "email",
                    "is_required": True,
                    "is_pii": True,
                    "options": [],
                },
            ],
        },
        submitted_answers=[
            {"question_key": "p", "value": "+44 7911 123456"},
            {"question_key": "e", "value": "  Jane@Example.COM "},
        ],
    )
    phone = next(answer for answer in validated if answer["question_key"] == "p")
    email = next(answer for answer in validated if answer["question_key"] == "e")
    assert phone["value"] == "+447911123456"
    assert phone["question_type"] == "phone"
    assert email["value"] == "Jane@example.com"
    assert email["question_type"] == "email"


def test_validate_public_answers_rejects_invalid_phone() -> None:
    with pytest.raises(HTTPException) as exc_info:
        validate_public_answers(
            schema_snapshot={
                "survey": {"title": "Contact"},
                "questions": [
                    {
                        "question_key": "p",
                        "question_type": "phone",
                        "is_required": True,
                        "is_pii": False,
                        "options": [],
                    }
                ],
            },
            submitted_answers=[{"question_key": "p", "value": "oops"}],
        )
    assert exc_info.value.status_code == 422


def test_validate_public_answers_rejects_invalid_email() -> None:
    with pytest.raises(HTTPException) as exc_info:
        validate_public_answers(
            schema_snapshot={
                "survey": {"title": "Contact"},
                "questions": [
                    {
                        "question_key": "e",
                        "question_type": "email",
                        "is_required": True,
                        "is_pii": False,
                        "options": [],
                    }
                ],
            },
            submitted_answers=[{"question_key": "e", "value": "nope"}],
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
