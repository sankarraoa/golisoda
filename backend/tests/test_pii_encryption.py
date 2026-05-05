import base64
import os
from uuid import uuid4

from app.core.config import Settings
from app.services.pii_encryption import (
    ENCRYPTED_VALUE_PREFIX,
    decrypt_tenant_dek,
    decrypt_with_key,
    encrypt_tenant_dek,
    encrypt_with_key,
    master_key_bytes,
)


def test_encrypt_with_key_round_trips_plaintext() -> None:
    key = os.urandom(32)
    aad = b"tenant:test:value"

    envelope = encrypt_with_key(plaintext="customer@example.com", key=key, aad=aad)

    assert envelope["ciphertext"] != "customer@example.com"
    assert decrypt_with_key(envelope=envelope, key=key, aad=aad) == "customer@example.com"


def test_master_key_accepts_base64_32_byte_secret() -> None:
    secret = base64.urlsafe_b64encode(os.urandom(32)).decode("ascii")
    settings = Settings(pii_master_key=secret)

    assert len(master_key_bytes(settings=settings)) == 32


def test_tenant_dek_round_trips_with_master_key() -> None:
    tenant_id = uuid4()
    settings = Settings(pii_master_key=base64.urlsafe_b64encode(os.urandom(32)).decode("ascii"))
    dek = os.urandom(32)

    encrypted_dek = encrypt_tenant_dek(
        dek=dek,
        tenant_id=tenant_id,
        key_version=1,
        settings=settings,
    )

    assert encrypted_dek != dek.decode("latin1", errors="ignore")
    assert (
        decrypt_tenant_dek(
            encrypted_dek=encrypted_dek,
            tenant_id=tenant_id,
            key_version=1,
            settings=settings,
        )
        == dek
    )


def test_encrypted_value_prefix_is_stable() -> None:
    assert ENCRYPTED_VALUE_PREFIX == "enc:v1:"
