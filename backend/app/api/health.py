from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from app.core.database import check_database
from app.core.redis import check_redis

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str


class ReadinessResponse(BaseModel):
    status: str
    checks: dict[str, bool]


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/ready", response_model=ReadinessResponse)
async def ready(response: Response) -> ReadinessResponse:
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
    if not is_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return ReadinessResponse(status="ready" if is_ready else "not_ready", checks=checks)
