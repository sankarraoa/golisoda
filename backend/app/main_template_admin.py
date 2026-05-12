"""Entry: Template Admin HTTP API (Railway service: `uvicorn app.main_template_admin:app`)."""

from app.core.apps import create_template_admin_app

app = create_template_admin_app()
