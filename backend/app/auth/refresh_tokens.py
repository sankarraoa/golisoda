import hashlib
import json
import secrets
from dataclasses import dataclass
from uuid import UUID, uuid4

from redis.asyncio import Redis

from app.core.config import Settings, get_settings


class RefreshTokenError(Exception):
    pass


@dataclass(frozen=True)
class RefreshSession:
    user_id: UUID
    tenant_id: UUID | None
    family_id: str
    token_hash: str


def create_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _token_key(token_hash: str) -> str:
    return f"refresh:token:{token_hash}"


def _used_key(token_hash: str) -> str:
    return f"refresh:used:{token_hash}"


def _family_key(family_id: str) -> str:
    return f"refresh:family:{family_id}"


def _ttl_seconds(settings: Settings | None = None) -> int:
    settings = settings or get_settings()
    return settings.jwt_refresh_token_days * 24 * 60 * 60


async def issue_refresh_token(
    redis: Redis,
    *,
    user_id: UUID,
    tenant_id: UUID | None,
    family_id: str | None = None,
    settings: Settings | None = None,
) -> str:
    token = create_refresh_token()
    token_hash = hash_refresh_token(token)
    family_id = family_id or str(uuid4())
    ttl = _ttl_seconds(settings)
    payload = {
        "user_id": str(user_id),
        "tenant_id": str(tenant_id) if tenant_id else None,
        "family_id": family_id,
    }

    await redis.set(_token_key(token_hash), json.dumps(payload), ex=ttl)
    await redis.sadd(_family_key(family_id), token_hash)
    await redis.expire(_family_key(family_id), ttl)
    return token


async def consume_refresh_token(redis: Redis, token: str) -> RefreshSession:
    token_hash = hash_refresh_token(token)
    raw_payload = await redis.get(_token_key(token_hash))
    if raw_payload is None:
        used_family_id = await redis.get(_used_key(token_hash))
        if used_family_id:
            await revoke_refresh_family(redis, used_family_id)
            raise RefreshTokenError("Refresh token reuse detected.")
        raise RefreshTokenError("Invalid refresh token.")

    payload = json.loads(raw_payload)
    await redis.delete(_token_key(token_hash))
    await redis.set(_used_key(token_hash), payload["family_id"], ex=_ttl_seconds())
    return RefreshSession(
        user_id=UUID(payload["user_id"]),
        tenant_id=UUID(payload["tenant_id"]) if payload["tenant_id"] else None,
        family_id=payload["family_id"],
        token_hash=token_hash,
    )


async def revoke_refresh_family(redis: Redis, family_id: str) -> None:
    token_hashes = await redis.smembers(_family_key(family_id))
    if token_hashes:
        await redis.delete(*[_token_key(token_hash) for token_hash in token_hashes])
    await redis.delete(_family_key(family_id))
