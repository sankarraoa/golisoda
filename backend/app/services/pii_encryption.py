import base64
import hashlib
import json
import os
from typing import Any
from uuid import UUID

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.security import PiiKeyRegistry

ENCRYPTION_ALGORITHM = "AES-256-GCM"
ENCRYPTED_VALUE_PREFIX = "enc:v1:"


def encrypt_with_key(*, plaintext: str, key: bytes, aad: bytes) -> dict[str, Any]:
    nonce = os.urandom(12)
    ciphertext = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), aad)
    return {
        "alg": ENCRYPTION_ALGORITHM,
        "nonce": _b64encode(nonce),
        "ciphertext": _b64encode(ciphertext),
    }


def decrypt_with_key(*, envelope: dict[str, Any], key: bytes, aad: bytes) -> str:
    if envelope.get("alg") != ENCRYPTION_ALGORITHM:
        raise ValueError("Unsupported encryption algorithm.")

    plaintext = AESGCM(key).decrypt(
        _b64decode(envelope["nonce"]),
        _b64decode(envelope["ciphertext"]),
        aad,
    )
    return plaintext.decode("utf-8")


async def encrypt_pii_value(
    *,
    session: AsyncSession,
    tenant_id: UUID,
    plaintext: str,
    settings: Settings | None = None,
) -> str:
    tenant_key = await get_or_create_active_tenant_key(
        session=session,
        tenant_id=tenant_id,
        settings=settings,
    )
    aad = _value_aad(tenant_id=tenant_id, key_version=tenant_key.key_version)
    envelope = encrypt_with_key(
        plaintext=plaintext,
        key=tenant_key.dek,
        aad=aad,
    )
    envelope["key_version"] = tenant_key.key_version
    return ENCRYPTED_VALUE_PREFIX + json.dumps(envelope, sort_keys=True, separators=(",", ":"))


async def decrypt_pii_value(
    *,
    session: AsyncSession,
    tenant_id: UUID,
    encrypted_value: str,
    settings: Settings | None = None,
) -> str:
    if not encrypted_value.startswith(ENCRYPTED_VALUE_PREFIX):
        raise ValueError("Encrypted value has an unsupported format.")

    envelope = json.loads(encrypted_value.removeprefix(ENCRYPTED_VALUE_PREFIX))
    key_version = int(envelope["key_version"])
    key_registry = await session.scalar(
        select(PiiKeyRegistry).where(
            PiiKeyRegistry.tenant_id == tenant_id,
            PiiKeyRegistry.key_version == key_version,
        )
    )
    if key_registry is None:
        raise ValueError("PII key version not found.")

    dek = decrypt_tenant_dek(
        encrypted_dek=key_registry.encrypted_dek,
        tenant_id=tenant_id,
        key_version=key_version,
        settings=settings,
    )
    return decrypt_with_key(
        envelope=envelope,
        key=dek,
        aad=_value_aad(tenant_id=tenant_id, key_version=key_version),
    )


async def get_or_create_active_tenant_key(
    *,
    session: AsyncSession,
    tenant_id: UUID,
    settings: Settings | None = None,
) -> "TenantDataKey":
    key_registry = await session.scalar(
        select(PiiKeyRegistry)
        .where(PiiKeyRegistry.tenant_id == tenant_id, PiiKeyRegistry.retired_at.is_(None))
        .order_by(PiiKeyRegistry.key_version.desc())
    )
    if key_registry is None:
        key_registry = await _create_tenant_key(
            session=session,
            tenant_id=tenant_id,
            settings=settings,
        )

    dek = decrypt_tenant_dek(
        encrypted_dek=key_registry.encrypted_dek,
        tenant_id=tenant_id,
        key_version=key_registry.key_version,
        settings=settings,
    )
    return TenantDataKey(key_version=key_registry.key_version, dek=dek)


async def _create_tenant_key(
    *,
    session: AsyncSession,
    tenant_id: UUID,
    settings: Settings | None,
) -> PiiKeyRegistry:
    latest_version = await session.scalar(
        select(func.max(PiiKeyRegistry.key_version)).where(PiiKeyRegistry.tenant_id == tenant_id)
    )
    key_version = (latest_version or 0) + 1
    dek = os.urandom(32)
    encrypted_dek = encrypt_tenant_dek(
        dek=dek,
        tenant_id=tenant_id,
        key_version=key_version,
        settings=settings,
    )
    key_registry = PiiKeyRegistry(
        tenant_id=tenant_id,
        key_version=key_version,
        encrypted_dek=encrypted_dek,
        encryption_context={"alg": ENCRYPTION_ALGORITHM, "scope": "tenant"},
    )
    session.add(key_registry)
    await session.flush()
    return key_registry


def encrypt_tenant_dek(
    *,
    dek: bytes,
    tenant_id: UUID,
    key_version: int,
    settings: Settings | None = None,
) -> str:
    envelope = encrypt_with_key(
        plaintext=_b64encode(dek),
        key=master_key_bytes(settings=settings),
        aad=_dek_aad(tenant_id=tenant_id, key_version=key_version),
    )
    envelope["key_version"] = key_version
    return json.dumps(envelope, sort_keys=True, separators=(",", ":"))


def decrypt_tenant_dek(
    *,
    encrypted_dek: str,
    tenant_id: UUID,
    key_version: int,
    settings: Settings | None = None,
) -> bytes:
    envelope = json.loads(encrypted_dek)
    plaintext = decrypt_with_key(
        envelope=envelope,
        key=master_key_bytes(settings=settings),
        aad=_dek_aad(tenant_id=tenant_id, key_version=key_version),
    )
    return _b64decode(plaintext)


def master_key_bytes(*, settings: Settings | None = None) -> bytes:
    secret = (settings or get_settings()).pii_master_key
    try:
        decoded = _b64decode(secret)
        if len(decoded) == 32:
            return decoded
    except ValueError:
        pass

    return hashlib.sha256(secret.encode("utf-8")).digest()


class TenantDataKey:
    def __init__(self, *, key_version: int, dek: bytes) -> None:
        self.key_version = key_version
        self.dek = dek


def _dek_aad(*, tenant_id: UUID, key_version: int) -> bytes:
    return f"tenant:{tenant_id}:pii-dek:{key_version}".encode()


def _value_aad(*, tenant_id: UUID, key_version: int) -> bytes:
    return f"tenant:{tenant_id}:pii-value:{key_version}".encode()


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)
