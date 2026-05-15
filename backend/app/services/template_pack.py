"""Survey template ZIP export/import (DB row + optional assets/)."""

from __future__ import annotations

import io
import json
import shutil
import zipfile
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.survey_template import SurveyTemplate
from app.schemas.survey_presentation import parse_presentation
from app.schemas.survey_theme import SurveyThemeConfig
from app.services.template_export_bundles import (
    add_bundled_frontend_sources_to_zip,
    default_hero_column_for_immersive_slug,
    export_immersive_hero_paths_relative_to_assets,
)

FORMAT_VERSION = 1
MAX_ZIP_BYTES = 30 * 1024 * 1024
TEMPLATE_JSON = "template.json"
ASSETS_DIR = "assets"

DESIGNER_README = """Survey template package (format v1)
================================

Contents
--------
- template.json     Required. Metadata, presentation JSON, and theme token map (same as DB columns).
- assets/           Optional. Files served with this template after import (CSS, images). You may see
                    ``assets/from-frontend/`` with snapshots copied from the SPA repo at export time
                    (needs ``frontend/`` next to ``backend`` or TEMPLATE_EXPORT_FRONTEND_ROOT).

Stylesheets
-----------
1. Add CSS under assets/, e.g. assets/theme.css
2. In template.json, set:
   "presentation": {
     ...existing presentation fields...,
     "package": { "stylesheets": ["theme.css"] }
   }
   Paths are relative to the assets/ folder. List order is load order.

3. Inside CSS, reference images with relative URLs so they resolve next to the stylesheet, e.g.:
     background: url(./hero.png);

4. Heritage immersive variants (slug prefix ``heritage_immersive``): optional ``presentation.package.immersive``:
     ``hero_column``: ``start`` (hero column first in LTR) or ``end`` (default). This is the **template** control for
     which grid column shows the hero vs. questions (implemented in the SPA with CSS grid ``order`` on the two columns).
     ``hero_asset_paths``: list of paths under ``assets/`` (e.g. ``from-frontend/public/feedback-theme/*.png``).
     Exports fill this when the monorepo ``frontend/`` is available and the DB list is empty; otherwise empty means
     use built-in ``/feedback-theme`` URLs only in the app.

Import
------
Use Platform Admin → Templates → Import template (.zip). Change `slug` in template.json
to a new value before re-importing. Slug must be unique.

Split deployments
-----------------
Template files live on disk under TEMPLATE_PACK_STORAGE_PATH. The same path must be
reachable by the service that serves GET /public/template-assets/... (usually the
monolith or tenant+public app). Use a shared volume on Railway or import a template
ZIP while running a single combined API.

"""

ASSETS_FOLDER_README = """This folder holds static assets for the template (CSS, images, fonts).

1. Add files here (e.g. theme.css, hero.png).
2. In template.json, list CSS under presentation.package.stylesheets using paths relative
   to this folder (example: "theme.css").
3. In CSS, use relative URLs for images: url(./hero.png)

See README.txt next to template.json for the full package format.

Stock templates may also include ``from-frontend/`` — copies of the web app's CSS and
public images (when the exporter can see the monorepo ``frontend/`` folder).
"""


def validate_theme_payload(raw: dict | None) -> dict[str, str]:
    if not raw:
        return {}
    if not isinstance(raw, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="theme must be a JSON object.",
        )
    pairs = {str(k): str(v) for k, v in raw.items() if isinstance(k, str) and isinstance(v, str)}
    return SurveyThemeConfig(tokens=pairs).tokens


def template_dir(settings: Settings, template_id: UUID) -> Path:
    return (settings.template_pack_storage_path / str(template_id)).resolve()


def remove_template_pack_dir(settings: Settings, template_id: UUID) -> None:
    root = template_dir(settings, template_id)
    if root.is_dir():
        shutil.rmtree(root, ignore_errors=True)


def safe_asset_path(assets_root: Path, relative: str) -> Path:
    """Resolve a relative path under assets_root; reject traversal."""
    rel = relative.replace("\\", "/").strip().lstrip("/")
    if not rel or ".." in rel.split("/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid asset path: {relative!r}",
        )
    dest = (assets_root / rel).resolve()
    try:
        dest.relative_to(assets_root)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid asset path: {relative!r}",
        ) from exc
    return dest


def validate_package_paths(presentation: dict) -> None:
    pkg = presentation.get("package")
    if pkg is None:
        return
    if not isinstance(pkg, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="presentation.package must be an object.")
    sheets = pkg.get("stylesheets")
    if sheets is not None:
        if not isinstance(sheets, list) or not all(isinstance(s, str) for s in sheets):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="presentation.package.stylesheets must be a list of strings.",
            )
        for s in sheets:
            rel = s.strip()
            if not rel or rel.startswith("/") or ".." in Path(rel).parts:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid stylesheet path: {s!r}",
                )
    immersive = pkg.get("immersive")
    if immersive is not None:
        if not isinstance(immersive, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="presentation.package.immersive must be an object.",
            )
        col = immersive.get("hero_column", "end")
        if col not in ("start", "end"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="presentation.package.immersive.hero_column must be 'start' or 'end'.",
            )
        paths = immersive.get("hero_asset_paths", [])
        if paths is None:
            paths = []
        if not isinstance(paths, list) or not all(isinstance(s, str) for s in paths):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="presentation.package.immersive.hero_asset_paths must be a list of strings.",
            )
        for s in paths:
            rel = s.strip()
            if not rel or rel.startswith("/") or ".." in Path(rel).parts:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid immersive hero path: {s!r}",
                )


def assert_stylesheets_on_disk(assets_root: Path, stylesheets: list[str]) -> None:
    for sheet in stylesheets:
        path = safe_asset_path(assets_root, sheet)
        if not path.is_file():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing stylesheet in assets/: {sheet}",
            )


def list_pack_files_on_disk(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    files: list[Path] = []
    for candidate in root.rglob("*"):
        if candidate.is_file():
            files.append(candidate)
    return sorted(files)


def enrich_export_manifest_with_immersive_hero_paths(settings: Settings, slug: str, manifest: dict[str, Any]) -> None:
    """Write stock hero paths into exported JSON when ``frontend/`` exists and DB paths are empty.

    Paths are relative to ``assets/`` (e.g. ``from-frontend/public/feedback-theme/...``).
    """
    injected = export_immersive_hero_paths_relative_to_assets(settings, slug)
    if not injected:
        return
    pres = manifest.get("presentation")
    if not isinstance(pres, dict):
        return
    pkg = pres.get("package")
    if pkg is None:
        pres["package"] = {
            "immersive": {
                "hero_column": default_hero_column_for_immersive_slug(slug),
                "hero_asset_paths": injected,
            },
        }
        return
    if not isinstance(pkg, dict):
        return
    imm = pkg.get("immersive")
    if imm is None:
        pkg["immersive"] = {
            "hero_column": default_hero_column_for_immersive_slug(slug),
            "hero_asset_paths": injected,
        }
        return
    if not isinstance(imm, dict):
        return
    existing = imm.get("hero_asset_paths")
    if isinstance(existing, list) and len(existing) > 0:
        return
    imm["hero_asset_paths"] = injected
    imm.setdefault("hero_column", default_hero_column_for_immersive_slug(slug))


def build_export_zip(settings: Settings, row: SurveyTemplate) -> bytes:
    root = template_dir(settings, row.id)
    presentation = parse_presentation(row.presentation)
    manifest: dict[str, Any] = {
        "format_version": FORMAT_VERSION,
        "slug": row.slug,
        "name": row.name,
        "description": row.description,
        "deployment_notes": row.deployment_notes,
        "presentation": presentation.model_dump(mode="json", exclude_none=True),
        "theme": dict(row.theme) if isinstance(row.theme, dict) else {},
        "sort_order": row.sort_order,
        "is_active": row.is_active,
    }
    enrich_export_manifest_with_immersive_hero_paths(settings, row.slug, manifest)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(TEMPLATE_JSON, json.dumps(manifest, indent=2) + "\n")
        zf.writestr("README.txt", DESIGNER_README)
        asset_arcs: set[str] = set()
        for file_path in list_pack_files_on_disk(root):
            arc = f"{ASSETS_DIR}/{file_path.relative_to(root).as_posix()}"
            zf.write(file_path, arcname=arc)
            asset_arcs.add(arc)
        add_bundled_frontend_sources_to_zip(zf, settings, row.slug, asset_arcs, assets_dir=ASSETS_DIR)
        # Built-in / migration templates have no on-disk pack; still ship an assets/ tree
        # so unzipping always shows the folder designers expect.
        if not any(arc.startswith(f"{ASSETS_DIR}/") for arc in asset_arcs):
            zf.writestr(f"{ASSETS_DIR}/README.txt", ASSETS_FOLDER_README)
    return buffer.getvalue()


async def import_template_pack(
    settings: Settings,
    session: AsyncSession,
    upload: UploadFile,
) -> SurveyTemplate:
    raw_bytes = await upload.read()
    if len(raw_bytes) > MAX_ZIP_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"ZIP must be at most {MAX_ZIP_BYTES // (1024 * 1024)} MB.",
        )
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw_bytes))
    except zipfile.BadZipFile as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ZIP file.",
        ) from exc

    with zf:
        try:
            manifest_bytes = zf.read(TEMPLATE_JSON)
        except KeyError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"ZIP must contain {TEMPLATE_JSON} at the archive root.",
            ) from exc
        try:
            manifest = json.loads(manifest_bytes.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="template.json is not valid UTF-8 JSON.",
            ) from exc

        if not isinstance(manifest, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="template.json must be a JSON object.")
        if manifest.get("format_version") != FORMAT_VERSION:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported format_version (expected {FORMAT_VERSION}).",
            )

        slug = manifest.get("slug")
        name = manifest.get("name")
        if not isinstance(slug, str) or not slug.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="template.json requires a non-empty slug.")
        if not isinstance(name, str) or not name.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="template.json requires name.")

        slug = slug.strip()
        existing = await session.scalar(select(SurveyTemplate.id).where(SurveyTemplate.slug == slug))
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A template with slug {slug!r} already exists. Change slug in template.json.",
            )

        description = manifest.get("description")
        deployment_notes = manifest.get("deployment_notes")
        sort_order = manifest.get("sort_order", 0)
        is_active = manifest.get("is_active", True)
        if description is not None and not isinstance(description, str):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="description must be a string or null.")
        if deployment_notes is not None and not isinstance(deployment_notes, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="deployment_notes must be a string or null.",
            )
        if not isinstance(sort_order, int):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sort_order must be an integer.")
        if not isinstance(is_active, bool):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="is_active must be a boolean.")

        presentation_raw = manifest.get("presentation")
        if not isinstance(presentation_raw, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="presentation must be a JSON object.")
        theme_raw = manifest.get("theme")
        if theme_raw is not None and not isinstance(theme_raw, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="theme must be a JSON object or null.")
        validate_package_paths(presentation_raw)

        theme = validate_theme_payload(theme_raw if isinstance(theme_raw, dict) else None)
        presentation = parse_presentation(presentation_raw)

        tpl = SurveyTemplate(
            slug=slug,
            name=name.strip(),
            description=description.strip() if isinstance(description, str) and description.strip() else None,
            deployment_notes=(
                deployment_notes.strip()
                if isinstance(deployment_notes, str) and deployment_notes.strip()
                else None
            ),
            presentation=presentation.model_dump(mode="json", exclude_none=True),
            theme=theme,
            sort_order=sort_order,
            is_active=is_active,
        )
        session.add(tpl)
        await session.flush()

        dest_root = template_dir(settings, tpl.id)
        try:
            if dest_root.exists():
                shutil.rmtree(dest_root)
            dest_root.mkdir(parents=True, exist_ok=True)

            assets_prefix = f"{ASSETS_DIR}/"
            extracted_any = False
            for member in zf.infolist():
                name_m = member.filename.replace("\\", "/")
                if name_m == TEMPLATE_JSON or name_m.endswith("/"):
                    continue
                if name_m.startswith(assets_prefix):
                    extracted_any = True
                    inner = name_m[len(assets_prefix) :]
                    if not inner or ".." in inner.split("/"):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Unsafe path in ZIP: {member.filename!r}",
                        )
                    target = safe_asset_path(dest_root, inner)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(member, "r") as src, target.open("wb") as out:
                        shutil.copyfileobj(src, out)

            pkg = presentation.package
            if pkg and pkg.stylesheets:
                assert_stylesheets_on_disk(dest_root, list(pkg.stylesheets))
            if pkg and pkg.immersive and pkg.immersive.hero_asset_paths:
                for hp in pkg.immersive.hero_asset_paths:
                    path = safe_asset_path(dest_root, hp.strip())
                    if not path.is_file():
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Missing immersive hero image in assets/: {hp}",
                        )

        except Exception:
            shutil.rmtree(dest_root, ignore_errors=True)
            await session.delete(tpl)
            await session.flush()
            raise

        return tpl
