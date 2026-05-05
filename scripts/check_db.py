import asyncio
import sys
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent / "backend"
if _BACKEND_ROOT.is_dir():
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.core.config import get_settings
from app.core.database import check_database


async def main() -> None:
    settings = get_settings()
    try:
        await check_database()
    except Exception as exc:
        print("Database connection failed.")
        print(f"DATABASE_URL: {settings.database_url}")
        print(f"Error: {exc}")
        raise SystemExit(1) from exc

    print("Database connection passed.")


if __name__ == "__main__":
    asyncio.run(main())
