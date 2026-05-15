"""Public static files for imported survey template ZIPs (assets/)."""

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.services.template_pack import safe_asset_path, template_dir

router = APIRouter(tags=["public"])


@router.get("/public/template-assets/{template_id}/{resource_path:path}")
async def get_template_pack_asset(template_id: UUID, resource_path: str) -> FileResponse:
    settings = get_settings()
    root = template_dir(settings, template_id)
    if not root.is_dir():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template assets not found.")
    try:
        path = safe_asset_path(root, resource_path)
    except HTTPException:
        raise
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
    media = _guess_media_type(path)
    return FileResponse(path, media_type=media)


def _guess_media_type(path: Path) -> str | None:
    suf = path.suffix.lower()
    return {
        ".css": "text/css; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
        ".ttf": "font/ttf",
        ".json": "application/json",
    }.get(suf)
