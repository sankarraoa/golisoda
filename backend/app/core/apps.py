"""FastAPI application factories for monolith vs split (microservice) deployments."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app.api.auth import (
    platform_admin_auth_router,
    tenant_admin_auth_router,
)
from app.api.auth import (
    router as monolith_auth_router,
)
from app.api.channels import router as channels_router
from app.api.health import router as health_router
from app.api.platform_admin import router as platform_admin_router
from app.api.public import router as public_router
from app.api.responses import router as responses_router
from app.api.survey_templates import router as survey_templates_router
from app.api.surveys import router as surveys_router
from app.api.tenants import router as tenants_router
from app.api.template_assets import router as template_assets_router
from app.api.uploads import router as uploads_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.request_id import RequestIdMiddleware


def _core_stack(app: FastAPI) -> None:
    settings = get_settings()
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.admin_cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def _instrument(app: FastAPI) -> None:
    Instrumentator().instrument(app).expose(app, include_in_schema=False)


def create_public_feedback_app() -> FastAPI:
    """Anonymous channel context + submission (`/f/*`, `/public/*`).

    Deploy with FEEDBACK_PROCESS_INLINE=false and run the feedback worker
    separately in production.
    """
    settings = get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(title=f"{settings.app_name} · Public Feedback")
    _core_stack(app)
    app.include_router(public_router)
    app.include_router(template_assets_router)
    app.include_router(health_router)
    _instrument(app)
    return app


def create_template_admin_app() -> FastAPI:
    """Survey template gallery (`/survey-templates`). JWT secrets must match tenant-admin login."""
    settings = get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(title=f"{settings.app_name} · Template Admin")
    _core_stack(app)
    app.include_router(survey_templates_router)
    app.include_router(health_router)
    _instrument(app)
    return app


def create_tenant_admin_app() -> FastAPI:
    """Tenant operators: auth, tenants, surveys, channels, responses, uploads (`/uploads/*`).

    Survey template list (`/survey-templates`) and public feedback (`/f/*`, `/public/*`) are
    included so a single :8000 process matches what the admin + feedback SPA expect when
    ``VITE_PUBLIC_FEEDBACK_API_URL`` defaults to ``VITE_API_BASE_URL``. Run
    :func:`create_public_feedback_app` alone when you isolate anonymous traffic.
    """
    settings = get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(title=f"{settings.app_name} · Tenant Admin")
    _core_stack(app)
    app.include_router(tenant_admin_auth_router)
    app.include_router(uploads_router)
    app.include_router(tenants_router)
    app.include_router(surveys_router)
    app.include_router(channels_router)
    app.include_router(responses_router)
    app.include_router(survey_templates_router)
    app.include_router(public_router)
    app.include_router(template_assets_router)
    app.include_router(health_router)
    _instrument(app)
    return app


def create_platform_admin_app() -> FastAPI:
    """Super-admin console: platform operators + tenant onboarding APIs."""
    settings = get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(
        title=f"{settings.app_name} · Platform Admin",
        description=(
            "Manage platform operators (`/platform/super-admin-users`) "
            "and onboard tenants."
        ),
    )
    _core_stack(app)
    app.include_router(platform_admin_auth_router)
    app.include_router(platform_admin_router)
    app.include_router(template_assets_router)
    app.include_router(health_router)
    _instrument(app)
    return app


def create_monolith_app() -> FastAPI:
    """All routes in one process (local dev default)."""
    settings = get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(title=settings.app_name)
    _core_stack(app)
    app.include_router(monolith_auth_router)
    app.include_router(uploads_router)
    app.include_router(tenants_router)
    app.include_router(surveys_router)
    app.include_router(channels_router)
    app.include_router(survey_templates_router)
    app.include_router(responses_router)
    app.include_router(platform_admin_router)
    app.include_router(public_router)
    app.include_router(template_assets_router)
    app.include_router(health_router)
    _instrument(app)
    return app
