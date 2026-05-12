"""Drain `FeedbackSubmissionQueue` into persisted responses.

Run as a Railway worker or locally:
  FEEDBACK_WORKER_POLL_SECONDS=1 goli-feedback-worker
"""

from __future__ import annotations

import asyncio
import os
from uuid import uuid4

import structlog

from app.core.config import get_settings
from app.core.database import get_session_factory
from app.core.logging import configure_logging
from app.workers.feedback_submission import process_feedback_submission_batch

log = structlog.get_logger(__name__)


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    poll_seconds = float(os.environ.get("FEEDBACK_WORKER_POLL_SECONDS") or "1.0")
    worker_id = os.environ.get("FEEDBACK_WORKER_ID") or f"railway-{uuid4().hex[:12]}"

    log.info(
        "feedback_worker.start",
        poll_seconds=poll_seconds,
        worker_id=worker_id,
    )

    asyncio.run(_run(worker_id=worker_id, poll_seconds=poll_seconds))


async def _run(*, worker_id: str, poll_seconds: float) -> None:
    factory = get_session_factory()
    while True:
        try:
            async with factory() as session:
                processed = await process_feedback_submission_batch(
                    session=session,
                    worker_id=worker_id,
                    limit=25,
                )
            if processed == 0:
                await asyncio.sleep(poll_seconds)
            else:
                await asyncio.sleep(0)
        except Exception:
            log.exception("feedback_worker.loop_crash")
            await asyncio.sleep(max(poll_seconds, 5))


if __name__ == "__main__":
    main()
