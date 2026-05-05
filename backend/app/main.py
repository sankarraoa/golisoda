from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.api.auth import router as auth_router
from app.api.channels import router as channels_router
from app.api.health import router as health_router
from app.api.public import router as public_router
from app.api.responses import router as responses_router
from app.api.survey_templates import router as survey_templates_router
from app.api.surveys import router as surveys_router
from app.api.tenants import router as tenants_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.request_id import RequestIdMiddleware


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(title=settings.app_name)

    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.admin_cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router)
    app.include_router(tenants_router)
    app.include_router(surveys_router)
    app.include_router(channels_router)
    app.include_router(survey_templates_router)
    app.include_router(responses_router)
    app.include_router(public_router)
    app.include_router(health_router)
    Instrumentator().instrument(app).expose(app, include_in_schema=False)
    return app


app = create_app()
