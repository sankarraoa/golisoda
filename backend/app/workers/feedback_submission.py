from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.channel import FeedbackChannel
from app.models.enums import QueueStatus
from app.models.queue import FeedbackSubmissionDeadLetter, FeedbackSubmissionQueue
from app.models.response import Response, ResponseAnswer
from app.services.feedback_submission import serialize_answer_value
from app.services.pii_encryption import encrypt_pii_value

MAX_ATTEMPTS = 3
LOCK_SECONDS = 60


async def process_feedback_submission_batch(
    *,
    session: AsyncSession,
    worker_id: str,
    limit: int = 25,
) -> int:
    queue_items = await _claim_queue_items(session=session, worker_id=worker_id, limit=limit)
    processed_count = 0
    for queue_item in queue_items:
        try:
            await _process_queue_item(session=session, queue_item=queue_item)
            processed_count += 1
        except Exception as exc:  # noqa: BLE001 - worker must capture failures into durable queue state.
            await _record_processing_failure(session=session, queue_item=queue_item, exc=exc)
    return processed_count


async def _claim_queue_items(
    *,
    session: AsyncSession,
    worker_id: str,
    limit: int,
) -> list[FeedbackSubmissionQueue]:
    now = datetime.now(UTC)
    result = await session.scalars(
        select(FeedbackSubmissionQueue)
        .where(
            FeedbackSubmissionQueue.status == QueueStatus.PENDING,
            FeedbackSubmissionQueue.next_attempt_at <= now,
        )
        .order_by(FeedbackSubmissionQueue.created_at)
        .limit(limit)
        .with_for_update(skip_locked=True)
    )
    queue_items = list(result)
    for queue_item in queue_items:
        queue_item.status = QueueStatus.PROCESSING
        queue_item.locked_by = worker_id
        queue_item.locked_until = now + timedelta(seconds=LOCK_SECONDS)
    await session.commit()
    return queue_items


async def _process_queue_item(
    *,
    session: AsyncSession,
    queue_item: FeedbackSubmissionQueue,
) -> None:
    existing_response = await session.scalar(
        select(Response).where(
            Response.tenant_id == queue_item.tenant_id,
            Response.channel_id == queue_item.channel_id,
            Response.idempotency_key_hash == queue_item.idempotency_key_hash,
        )
    )
    if existing_response is None:
        channel = await session.get(FeedbackChannel, queue_item.channel_id)
        if channel is None:
            raise ValueError("Feedback channel no longer exists.")

        response = Response(
            tenant_id=queue_item.tenant_id,
            channel_id=queue_item.channel_id,
            location_id=channel.location_id,
            survey_version_id=queue_item.survey_version_id,
            idempotency_key_hash=queue_item.idempotency_key_hash,
            locale=queue_item.payload.get("locale", "en"),
            metadata_json=queue_item.payload.get("metadata", {}),
        )
        session.add(response)
        await session.flush()

        for answer in queue_item.payload.get("answers", []):
            is_pii = answer.get("is_pii", False)
            raw_value = serialize_answer_value(answer["value"])
            stored_raw_value = (
                await encrypt_pii_value(
                    session=session,
                    tenant_id=queue_item.tenant_id,
                    plaintext=raw_value,
                )
                if is_pii
                else raw_value
            )
            session.add(
                ResponseAnswer(
                    tenant_id=queue_item.tenant_id,
                    response_id=response.id,
                    question_key=answer["question_key"],
                    question_type=answer["question_type"],
                    raw_value=stored_raw_value,
                    value_json=None if is_pii else answer["value"],
                    is_pii=is_pii,
                )
            )

    queue_item.status = QueueStatus.COMPLETED
    queue_item.completed_at = datetime.now(UTC)
    queue_item.locked_by = None
    queue_item.locked_until = None
    await session.commit()


async def _record_processing_failure(
    *,
    session: AsyncSession,
    queue_item: FeedbackSubmissionQueue,
    exc: Exception,
) -> None:
    queue_item.attempt_count += 1
    queue_item.last_error = str(exc)
    queue_item.locked_by = None
    queue_item.locked_until = None

    if queue_item.attempt_count >= MAX_ATTEMPTS:
        queue_item.status = QueueStatus.DEAD_LETTERED
        session.add(
            FeedbackSubmissionDeadLetter(
                tenant_id=queue_item.tenant_id,
                queue_id=queue_item.id,
                channel_id=queue_item.channel_id,
                survey_version_id=queue_item.survey_version_id,
                payload=queue_item.payload,
                error_class=exc.__class__.__name__,
                error_message=str(exc),
                attempt_count=queue_item.attempt_count,
                request_id=queue_item.request_id,
            )
        )
    else:
        queue_item.status = QueueStatus.PENDING
        queue_item.next_attempt_at = datetime.now(UTC) + timedelta(
            seconds=30 * queue_item.attempt_count
        )

    await session.commit()
