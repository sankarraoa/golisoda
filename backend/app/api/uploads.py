"""Public GET for locally stored tenant branding images."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from app.core.config import get_settings
from app.services.branding_assets import resolve_uploaded_logo_file

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.get("/branding/{tenant_id}/{filename}")
async def get_tenant_branding_logo(tenant_id: UUID, filename: str) -> FileResponse:
    settings = get_settings()
    path = resolve_uploaded_logo_file(settings.tenant_branding_storage_path, tenant_id, filename)
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logo not found.")
    return FileResponse(path)
