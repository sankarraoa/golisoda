import hashlib
import json
import secrets
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.channel import FeedbackChannel
from app.models.enums import QuestionType, QueueStatus
from app.models.queue import FeedbackSubmissionQueue
from app.utils.answer_validation import (
    validated_email_normalized,
    validated_phone_normalized,
    validated_short_text,
)


def hash_idempotency_key(channel_code: str, idempotency_key: str) -> str:
    normalized = f"{channel_code}:{idempotency_key}".encode()
    return hashlib.sha256(normalized).hexdigest()


def generated_idempotency_key() -> str:
    return secrets.token_urlsafe(24)


def validate_public_answers(
    *,
    schema_snapshot: dict,
    submitted_answers: list[dict],
) -> list[dict]:
    questions = schema_snapshot.get("questions", [])
    question_map = {question["question_key"]: question for question in questions}
    submitted_map: dict[str, Any] = {}

    for answer in submitted_answers:
        question_key = answer["question_key"]
        if question_key in submitted_map:
            raise HTTPException(status_code=422, detail=f"Duplicate answer for {question_key}.")
        if question_key not in question_map:
            raise HTTPException(status_code=422, detail=f"Unknown question {question_key}.")
        submitted_map[question_key] = answer["value"]

    for question in questions:
        if question.get("is_required", False) and question["question_key"] not in submitted_map:
            raise HTTPException(
                status_code=422,
                detail=f"Missing required answer for {question['question_key']}.",
            )

    validated_answers: list[dict] = []
    for question_key, value in submitted_map.items():
        question = question_map[question_key]
        question_type = QuestionType(question["question_type"])
        normalized_value = _validate_value(
            question=question,
            question_type=question_type,
            value=value,
        )
        validated_answers.append(
            {
                "question_key": question_key,
                "question_type": question_type.value,
                "value": normalized_value,
                "is_pii": bool(question.get("is_pii", False)),
            }
        )

    return validated_answers


async def enqueue_public_submission(
    *,
    session: AsyncSession,
    channel: FeedbackChannel,
    channel_code: str,
    payload: dict,
    request_id: str | None,
    idempotency_key: str | None,
) -> FeedbackSubmissionQueue:
    effective_idempotency_key = idempotency_key or generated_idempotency_key()
    idempotency_key_hash = hash_idempotency_key(channel_code, effective_idempotency_key)

    existing = await session.scalar(
        select(FeedbackSubmissionQueue).where(
            FeedbackSubmissionQueue.tenant_id == channel.tenant_id,
            FeedbackSubmissionQueue.channel_id == channel.id,
            FeedbackSubmissionQueue.idempotency_key_hash == idempotency_key_hash,
        )
    )
    if existing is not None:
        return existing

    queue_item = FeedbackSubmissionQueue(
        tenant_id=channel.tenant_id,
        channel_id=channel.id,
        survey_version_id=channel.survey_version_id,
        idempotency_key_hash=idempotency_key_hash,
        payload=payload,
        status=QueueStatus.PENDING,
        request_id=request_id,
    )
    session.add(queue_item)
    await session.commit()
    await session.refresh(queue_item)
    return queue_item


def serialize_answer_value(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _validate_value(*, question: dict, question_type: QuestionType, value: Any) -> Any:
    if question_type == QuestionType.NPS:
        if not isinstance(value, int) or value < 0 or value > 10:
            raise HTTPException(
                status_code=422,
                detail=f"{question['question_key']} must be an integer from 0 to 10.",
            )
        return value

    if question_type == QuestionType.CSAT_5:
        if not isinstance(value, int) or value < 1 or value > 5:
            raise HTTPException(
                status_code=422,
                detail=f"{question['question_key']} must be an integer from 1 to 5.",
            )
        return value

    if question_type == QuestionType.CSAT_4:
        if not isinstance(value, int) or value < 1 or value > 4:
            raise HTTPException(
                status_code=422,
                detail=f"{question['question_key']} must be an integer from 1 to 4.",
            )
        return value

    if question_type == QuestionType.CSAT_2:
        if not isinstance(value, int) or value < 1 or value > 2:
            raise HTTPException(
                status_code=422,
                detail=f"{question['question_key']} must be an integer from 1 to 2.",
            )
        return value

    if question_type == QuestionType.PLAIN_TEXT:
        if not isinstance(value, str):
            raise HTTPException(status_code=422, detail=f"{question['question_key']} must be text.")
        return value.strip()

    if question_type == QuestionType.SHORT_TEXT:
        if not isinstance(value, str):
            raise HTTPException(status_code=422, detail=f"{question['question_key']} must be text.")
        out = validated_short_text(value)
        if out is None:
            raise HTTPException(
                status_code=422,
                detail=f"{question['question_key']} exceeds maximum length.",
            )
        return out

    if question_type == QuestionType.PHONE:
        if not isinstance(value, str):
            raise HTTPException(status_code=422, detail=f"{question['question_key']} must be text.")
        out = validated_phone_normalized(value)
        if out is None:
            raise HTTPException(
                status_code=422,
                detail=f"{question['question_key']} is not a valid phone number.",
            )
        return out

    if question_type == QuestionType.EMAIL:
        if not isinstance(value, str):
            raise HTTPException(status_code=422, detail=f"{question['question_key']} must be text.")
        out = validated_email_normalized(value)
        if out is None:
            raise HTTPException(
                status_code=422,
                detail=f"{question['question_key']} is not a valid email address.",
            )
        return out

    option_values = {option["value"] for option in question.get("options", [])}
    if question_type in {QuestionType.SINGLE_SELECTION, QuestionType.DROPDOWN}:
        if not isinstance(value, str) or value not in option_values:
            raise HTTPException(
                status_code=422,
                detail=f"{question['question_key']} has an invalid option.",
            )
        return value

    if question_type == QuestionType.MULTI_SELECTION:
        if not isinstance(value, list) or not value:
            raise HTTPException(
                status_code=422,
                detail=f"{question['question_key']} must include one or more options.",
            )
        if any(not isinstance(item, str) or item not in option_values for item in value):
            raise HTTPException(
                status_code=422,
                detail=f"{question['question_key']} has an invalid option.",
            )
        return value

    raise HTTPException(
        status_code=422,
        detail=f"{question['question_key']} has an unsupported question type.",
    )
