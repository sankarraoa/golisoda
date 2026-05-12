from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.database import check_database
from app.core.redis import check_redis

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str


class ReadinessResponse(BaseModel):
    status: str
    service: str
    checks: dict[str, bool]


async def _readiness_payload() -> tuple[ReadinessResponse, bool]:
    checks = {
        "database": False,
        "redis": False,
    }

    for name, check in (("database", check_database), ("redis", check_redis)):
        try:
            checks[name] = await check()
        except Exception:
            checks[name] = False

    is_ready = all(checks.values())
    settings = get_settings()
    payload = ReadinessResponse(
        status="ready" if is_ready else "not_ready",
        service=settings.service_name,
        checks=checks,
    )
    return payload, is_ready


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/health/live", response_model=HealthResponse)
async def health_live() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/ready", response_model=ReadinessResponse)
async def ready(response: Response) -> ReadinessResponse:
    payload, is_ready = await _readiness_payload()
    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return payload


@router.get("/health/ready", response_model=ReadinessResponse)
async def health_ready(response: Response) -> ReadinessResponse:
    payload, is_ready = await _readiness_payload()
    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return payload
