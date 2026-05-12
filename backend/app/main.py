from fastapi import FastAPI

from app.core.apps import create_monolith_app


def create_app() -> FastAPI:
    """Monolith FastAPI application (backward compatible tests + local dev default)."""
    return create_monolith_app()


app = create_monolith_app()
