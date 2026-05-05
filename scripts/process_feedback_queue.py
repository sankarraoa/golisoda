import argparse
import asyncio
import signal
import sys
import uuid
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent / "backend"
if _BACKEND_ROOT.is_dir():
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.core.database import get_session_factory
from app.workers.feedback_submission import process_feedback_submission_batch

shutdown_event = asyncio.Event()


async def main() -> None:
    parser = argparse.ArgumentParser(description="Process queued public feedback submissions.")
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--poll-seconds", type=float, default=2.0)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--worker-id", default=f"local-{uuid.uuid4()}")
    args = parser.parse_args()

    loop = asyncio.get_running_loop()
    for signal_name in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signal_name, shutdown_event.set)

    while not shutdown_event.is_set():
        async with get_session_factory()() as session:
            processed_count = await process_feedback_submission_batch(
                session=session,
                worker_id=args.worker_id,
                limit=args.limit,
            )
        print(f"Processed {processed_count} feedback submission(s).")

        if args.once:
            break
        try:
            await asyncio.wait_for(shutdown_event.wait(), timeout=args.poll_seconds)
        except TimeoutError:
            continue


if __name__ == "__main__":
    asyncio.run(main())
