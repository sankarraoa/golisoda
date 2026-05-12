"""Entry: Public Feedback HTTP API (Railway service: `uvicorn app.main_public_feedback:app`)."""

from app.core.apps import create_public_feedback_app

app = create_public_feedback_app()
