from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "Goli Soda Feedback API"
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
