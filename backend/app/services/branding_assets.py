"""Store tenant logos locally; reject hot-linked external URLs in branding."""

from __future__ import annotations

import re
import uuid
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

import httpx
from PIL import Image

LOGO_UPLOAD_MARKER = "/uploads/branding/"
MAX_LOGO_BYTES = 5 * 1024 * 1024
_FILENAME_SAFE = re.compile(
    r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|jpeg|webp)$",
    re.I,
)


class BrandingAssetError(Exception):
    pass


def ensure_upload_root(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def _format_extension(img_format: str) -> str:
    normalized = img_format.upper()
    if normalized == "JPEG":
        return ".jpg"
    if normalized == "PNG":
        return ".png"
    if normalized == "WEBP":
        return ".webp"
    raise BrandingAssetError("Unsupported image format. Use PNG, JPEG, or WebP.")


def validate_and_prepare_logo_bytes(raw: bytes) -> tuple[bytes, str]:
    """Return (bytes, file extension including dot)."""
    if len(raw) > MAX_LOGO_BYTES:
        raise BrandingAssetError("Logo file is too large (max 5 MB).")

    buf = BytesIO(raw)
    with Image.open(buf) as img:
        img.verify()

    buf2 = BytesIO(raw)
    with Image.open(buf2) as img2:
        if img2.format not in ("PNG", "JPEG", "WEBP"):
            raise BrandingAssetError("Unsupported image format. Use PNG, JPEG, or WebP.")
        ext = _format_extension(img2.format)
        return raw, ext


def write_logo_file(upload_root: Path, tenant_id: UUID, content: bytes, ext: str) -> str:
    """Writes under upload_root/<tenant_id>/ and returns basename."""
    basename = f"{uuid.uuid4()}{ext}"
    tenant_dir = ensure_upload_root(upload_root / str(tenant_id))
    destination = tenant_dir / basename
    destination.write_bytes(content)
    return basename


def public_logo_url(*, api_public_origin: str, tenant_id: UUID, filename: str) -> str:
    return f"{api_public_origin.rstrip('/')}{LOGO_UPLOAD_MARKER}{tenant_id}/{filename}"


def resolve_uploaded_logo_file(upload_root: Path, tenant_id: UUID, filename: str) -> Path | None:
    if not _FILENAME_SAFE.match(filename):
        return None
    tenant_dir = (ensure_upload_root(upload_root) / str(tenant_id)).resolve()
    candidate = (tenant_dir / filename).resolve()
    if not candidate.is_relative_to(tenant_dir) or not candidate.is_file():
        return None
    return candidate


def parse_local_logo_file(
    logo_url: str | None, *, tenant_id: UUID, upload_root: Path
) -> Path | None:
    """If logo_url points at our upload path for this tenant, return file path."""
    if not logo_url or LOGO_UPLOAD_MARKER not in logo_url:
        return None
    try:
        path_part = logo_url.split(LOGO_UPLOAD_MARKER, 1)[1]
        tenant_part, name = path_part.split("/", 1)
        if UUID(tenant_part) != tenant_id:
            return None
        if not _FILENAME_SAFE.match(name):
            return None
        candidate = (upload_root / tenant_part / name).resolve()
        tenant_resolved = (upload_root / str(tenant_id)).resolve()
        if not candidate.is_relative_to(tenant_resolved) or not candidate.is_file():
            return None
        return candidate
    except (ValueError, IndexError):
        return None


def remove_local_logo_file(
    logo_url: str | None, *, tenant_id: UUID, upload_root: Path
) -> None:
    path = parse_local_logo_file(logo_url, tenant_id=tenant_id, upload_root=upload_root)
    if path is not None:
        try:
            path.unlink()
        except OSError:
            pass


async def download_logo_bytes(url: str, *, timeout_s: float = 20.0) -> bytes:
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise BrandingAssetError("Invalid URL.")

    async with httpx.AsyncClient(timeout=timeout_s, follow_redirects=True) as client:
        response = await client.get(url.strip())
        response.raise_for_status()
        ctype = response.headers.get("content-type", "").split(";")[0].strip().lower()
        if ctype:
            allowed_ct = frozenset(
                {"image/png", "image/jpeg", "image/webp", "application/octet-stream"}
            )
            if ctype not in allowed_ct:
                raise BrandingAssetError("URL did not return a supported image type.")
        return response.content
