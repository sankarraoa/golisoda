from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import jwt

from app.core.config import Settings, get_settings


class TokenError(Exception):
    pass


def utc_now() -> datetime:
    return datetime.now(UTC)


def create_access_token(
    *,
    user_id: UUID,
    email: str,
    tenant_id: UUID | None,
    role_codes: list[str],
    permission_codes: list[str],
    location_ids: list[UUID],
    token_version: int,
    settings: Settings | None = None,
) -> tuple[str, int]:
    settings = settings or get_settings()
    expires_delta = timedelta(minutes=settings.jwt_access_token_minutes)
    expires_at = utc_now() + expires_delta
    payload = {
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "sub": str(user_id),
        "email": email,
        "tenant_id": str(tenant_id) if tenant_id else None,
        "role_codes": role_codes,
        "permission_codes": permission_codes,
        "location_ids": [str(location_id) for location_id in location_ids],
        "token_version": token_version,
        "jti": str(uuid4()),
        "iat": int(utc_now().timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, int(expires_delta.total_seconds())


def decode_access_token(token: str, settings: Settings | None = None) -> dict:
    settings = settings or get_settings()
    try:
        return jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
        )
    except jwt.PyJWTError as exc:
        raise TokenError("Invalid access token.") from exc
