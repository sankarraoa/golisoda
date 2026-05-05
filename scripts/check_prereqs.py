from importlib import import_module


REQUIRED_MODULES = [
    "alembic",
    "argon2",
    "asyncpg",
    "cryptography",
    "fastapi",
    "jwt",
    "prometheus_fastapi_instrumentator",
    "pydantic_settings",
    "qrcode",
    "redis",
    "sqlalchemy",
    "structlog",
    "uvicorn",
]


def main() -> None:
    for module_name in REQUIRED_MODULES:
        import_module(module_name)
    print("Backend prerequisite imports passed.")


if __name__ == "__main__":
    main()
