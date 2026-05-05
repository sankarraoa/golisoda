from __future__ import annotations

from uuid import uuid4

import pytest

from app.auth.passwords import hash_password, verify_password
from app.auth.refresh_tokens import (
    RefreshTokenError,
    consume_refresh_token,
    issue_refresh_token,
)
from app.auth.tokens import create_access_token, decode_access_token


class FakeRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.sets: dict[str, set[str]] = {}

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self.values[key] = value

    async def get(self, key: str) -> str | None:
        return self.values.get(key)

    async def delete(self, *keys: str) -> None:
        for key in keys:
            self.values.pop(key, None)
            self.sets.pop(key, None)

    async def sadd(self, key: str, value: str) -> None:
        self.sets.setdefault(key, set()).add(value)

    async def expire(self, key: str, ttl: int) -> None:
        return None

    async def smembers(self, key: str) -> set[str]:
        return self.sets.get(key, set())


def test_password_hash_round_trip() -> None:
    password_hash = hash_password("Admin@12345")

    assert verify_password("Admin@12345", password_hash)
    assert not verify_password("wrong-password", password_hash)


def test_access_token_round_trip() -> None:
    user_id = uuid4()
    tenant_id = uuid4()
    location_id = uuid4()

    token, expires_in = create_access_token(
        user_id=user_id,
        email="admin@example.com",
        tenant_id=tenant_id,
        role_codes=["tenant_admin"],
        permission_codes=["tenant:read"],
        location_ids=[location_id],
        token_version=1,
    )
    payload = decode_access_token(token)

    assert expires_in == 900
    assert payload["sub"] == str(user_id)
    assert payload["tenant_id"] == str(tenant_id)
    assert payload["role_codes"] == ["tenant_admin"]
    assert payload["permission_codes"] == ["tenant:read"]
    assert payload["location_ids"] == [str(location_id)]


@pytest.mark.asyncio
async def test_refresh_token_is_single_use() -> None:
    redis = FakeRedis()
    user_id = uuid4()
    token = await issue_refresh_token(redis, user_id=user_id, tenant_id=None)

    session = await consume_refresh_token(redis, token)

    assert session.user_id == user_id
    with pytest.raises(RefreshTokenError):
        await consume_refresh_token(redis, token)
