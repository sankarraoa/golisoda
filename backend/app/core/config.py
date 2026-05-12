import os
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "Goli Soda Feedback API"
    #: Shown on `/ready`; set env `SERVICE_NAME` per Railway service.
    service_name: str = Field(
        default="monolith",
        validation_alias=AliasChoices("SERVICE_NAME", "service_name"),
    )
    environment: str = "local"
    log_level: str = "INFO"

    database_url: str = "postgresql+asyncpg://goli_soda:goli_soda_dev_password@localhost:5432/goli_soda"
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
    def normalize_database_url(cls, value: str) -> str:
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+asyncpg://", 1)
        return value

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
