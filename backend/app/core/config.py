import os
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

BACKEND_DIR = Path(__file__).resolve().parents[2]

_DEFAULT_DATABASE_URL = (
    "postgresql+asyncpg://goli_soda:goli_soda_dev_password@localhost:5432/goli_soda"
)


class Settings(BaseSettings):
    app_name: str = "Goli Soda Feedback API"
    #: Shown on `/ready`; set env `SERVICE_NAME` per Railway service.
    service_name: str = Field(
        default="monolith",
        validation_alias=AliasChoices("SERVICE_NAME", "service_name"),
    )
    environment: str = "local"
    log_level: str = "INFO"

    database_url: str = _DEFAULT_DATABASE_URL
    redis_url: str = "redis://localhost:6379/0"

    jwt_issuer: str = "goli-soda"
    jwt_audience: str = "goli-soda-api"
    jwt_access_token_minutes: int = 15
    jwt_refresh_token_days: int = 30
    jwt_secret_key: str = Field(
        default="change-me-in-local-only-please-override",
        min_length=32,
    )
    jwt_algorithm: str = "HS256"

    pii_master_key: str = Field(default="change-me-in-local-only", min_length=16)
    public_feedback_base_url: str = "http://127.0.0.1:5173"
    admin_cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000"
    )

    #: Public origin of this API (used for persisted branding logo URLs and upload paths).
    api_public_origin: str = "http://127.0.0.1:8000"

    #: On-disk tenant logo storage (JPEG/PNG/WebP copied locally from upload or remote URL).
    tenant_branding_storage_path: Path = BACKEND_DIR / "data" / "tenant_branding"

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        env_prefix="",
        case_sensitive=False,
    )

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: object) -> str:
        """
        - Railway often supplies `postgres://` or `postgresql://`; SQLAlchemy async needs
          `postgresql+asyncpg://`.
        - **Do not leave `sslmode` or `ssl` in the query string.** SQLAlchemy forwards URL
          query keys as keyword arguments to `asyncpg.connect()`, which does **not** accept
          `sslmode` (`TypeError: unexpected keyword argument 'sslmode'`). TLS for managed
          Postgres is applied via **`connect_args={"ssl": True}`** (see
          `database_asyncpg_connect_args`).
        """
        if not isinstance(value, str):
            return value  # type: ignore[return-value]

        url = value.strip().strip('"').strip("'")
        if not url:
            # Empty DATABASE_URL in env would otherwise become "?sslmode=require" under Railway.
            return _DEFAULT_DATABASE_URL

        if url.startswith("postgres://"):
            url = "postgresql+asyncpg://" + url[len("postgres://") :]
        elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://") :]

        parts = urlsplit(url)
        q = dict(parse_qsl(parts.query, keep_blank_values=True))

        # Strip TLS query keys so SQLAlchemy does not pass them into asyncpg.connect(); TLS is set
        # in create_async_engine(..., connect_args=...) instead.
        q.pop("sslmode", None)
        q.pop("ssl", None)

        new_query = urlencode(list(q.items()))
        out = urlunsplit((parts.scheme, parts.netloc, parts.path, new_query, parts.fragment))
        try:
            make_url(out)
        except Exception as exc:  # noqa: BLE001 — surface URL problems early
            raise ValueError(
                "DATABASE_URL is not a valid SQLAlchemy URL after normalization. "
                "Use the Postgres plugin reference (e.g. ${{ Postgres.DATABASE_URL }}) "
                "with no extra quotes; do not leave DATABASE_URL empty on Railway."
            ) from exc
        return out

    @property
    def database_asyncpg_connect_args(self) -> dict[str, Any]:
        """
        asyncpg expects TLS via the `ssl` argument to connect(), not `sslmode=` in the URL.
        Optional env: `DATABASE_SSL=true|false` to force TLS on or off; when unset, TLS is
        enabled for non-localhost URLs when `RAILWAY_ENVIRONMENT` is set.
        """
        raw = os.environ.get("DATABASE_SSL")
        if raw is not None:
            r = raw.strip().lower()
            if r in ("0", "false", "no"):
                return {}
            if r in ("1", "true", "yes"):
                return {"ssl": True}

        parts = urlsplit(self.database_url)
        host = (parts.hostname or "").lower()
        is_local = not host or host in ("localhost", "127.0.0.1", "::1")
        if os.environ.get("RAILWAY_ENVIRONMENT") and not is_local:
            return {"ssl": True}
        return {}

    @property
    def admin_cors_origin_list(self) -> list[str]:
        configured_origins = [
            origin.strip() for origin in self.admin_cors_origins.split(",") if origin.strip()
        ]
        local_dev_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
        return list(dict.fromkeys([*configured_origins, *local_dev_origins]))

    def process_public_feedback_inline(self) -> bool:
        """
        When True, submitting public feedback drains the ingestion queue immediately in the API
        process (so responses appear without a separate worker).

        Override with FEEDBACK_PROCESS_INLINE=true|false. If unset: enabled for environments
        local, development, test; disabled otherwise.
        """
        raw = os.environ.get("FEEDBACK_PROCESS_INLINE")
        if raw is not None:
            return raw.strip().lower() in ("1", "true", "yes")
        return self.environment.strip().lower() in ("local", "development", "test")


@lru_cache
def get_settings() -> Settings:
    return Settings()
