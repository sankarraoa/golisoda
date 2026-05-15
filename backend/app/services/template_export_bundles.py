"""Map survey template slugs to SPA source files for ZIP export.

Stock templates store presentation JSON in the database, but CSS and images usually
live under the web app's ``frontend/`` tree. Exports copy those into
``assets/from-frontend/...`` so designers can edit them alongside ``template.json``.
"""

from __future__ import annotations

import zipfile
from pathlib import Path
from typing import Final

from app.core.config import BACKEND_DIR, Settings

# Paths are relative to ``frontend/`` (repo root sibling of ``backend/``).
_HERITAGE_IMMERSIVE_FRONTEND_FILES: Final[tuple[str, ...]] = (
    "src/styles/public-feedback-heritage.css",
    "public/feedback-theme/heritage-immersive-hero.png",
    "public/feedback-theme/heritage-immersive-hero-1.png",
    "public/feedback-theme/heritage-immersive-hero-2.png",
    "public/feedback-theme/heritage-immersive-hero-3.png",
    "public/feedback-theme/heritage-immersive-hero-4.png",
)

# Subset shipped in template.json → hero_asset_paths (matches runtime stock rotation in the SPA).
HERITAGE_IMMERSIVE_EXPORT_HERO_PATHS: Final[tuple[str, ...]] = (
    "public/feedback-theme/heritage-immersive-hero-1.png",
    "public/feedback-theme/heritage-immersive-hero-2.png",
    "public/feedback-theme/heritage-immersive-hero-3.png",
    "public/feedback-theme/heritage-immersive-hero-4.png",
)

BUNDLED_STATIC_FILES_BY_TEMPLATE_SLUG: Final[dict[str, tuple[str, ...]]] = {
    "heritage_immersive": _HERITAGE_IMMERSIVE_FRONTEND_FILES,
    "heritage_immersive_hero_start": _HERITAGE_IMMERSIVE_FRONTEND_FILES,
    "heritage_luxury": (
        "src/styles/public-feedback-jewelry-card.css",
        "public/feedback-theme/jewelry-feedback-hero.png",
    ),
    "kiosk_touch": ("src/styles/public-feedback-kiosk.css",),
    "phone_portrait": ("src/styles/public-feedback-phone-portrait.css",),
    "default_stepper": (
        "src/styles/public-feedback.css",
        "src/styles/tokens.css",
    ),
    "single_page": (
        "src/styles/public-feedback.css",
        "src/styles/tokens.css",
    ),
}

FROM_FRONTEND_README = """This folder contains copies of files from the feedback web app (frontend/)
at the time of export. Paths mirror the repo (e.g. src/styles/..., public/...).

Edit these for design work. After import, the API can serve CSS listed in
template.json → presentation.package.stylesheets (paths relative to assets/).
Images referenced by the stock app may still use /feedback-theme/... in the SPA build;
for pack-only delivery, prefer relative URLs in CSS (e.g. url(./image.png)) next to
your stylesheet, or wire paths in your frontend fork.

See README.txt at the archive root for the full package format.
"""

MONOREPO_FRONTEND_MISSING = """No frontend checkout was available when this ZIP was built.

The API looks for the web app at ../frontend (next to the backend folder) or at
TEMPLATE_EXPORT_FRONTEND_ROOT if set in the environment.

Set that to your monorepo's ``frontend`` directory on the machine running the export,
then download the template again to include CSS and image sources under assets/from-frontend/.
"""


def export_immersive_hero_paths_relative_to_assets(settings: Settings, template_slug: str) -> list[str]:
    """Paths under ``assets/`` for template.json ``hero_asset_paths``, when monorepo frontend is available.

    For any slug in the ``heritage_immersive*`` family; lists PNGs that exist so re-import validates.
    """
    norm = template_slug.replace("-", "_")
    if not norm.startswith("heritage_immersive"):
        return []
    if BUNDLED_STATIC_FILES_BY_TEMPLATE_SLUG.get(template_slug) is None:
        return []
    fe_root = resolve_template_export_frontend_root(settings)
    if fe_root is None:
        return []
    prefix = "from-frontend/"
    out: list[str] = []
    for rel in HERITAGE_IMMERSIVE_EXPORT_HERO_PATHS:
        key = rel.replace("\\", "/").strip().lstrip("/")
        if ".." in Path(key).parts:
            continue
        src = (fe_root / key).resolve()
        try:
            src.relative_to(fe_root.resolve())
        except ValueError:
            continue
        if src.is_file():
            out.append(f"{prefix}{key}")
    return out


def default_hero_column_for_immersive_slug(template_slug: str) -> str:
    """Infer exported default when DB row has no package.immersive."""
    normalized = template_slug.replace("-", "_").lower()
    if "hero_start" in normalized:
        return "start"
    return "end"


def resolve_template_export_frontend_root(settings: Settings) -> Path | None:
    """Directory containing ``src/``, ``public/`` (the Vite ``frontend`` package root)."""
    raw = settings.template_export_frontend_root
    if raw is not None:
        p = Path(raw).expanduser().resolve()
        return p if p.is_dir() else None
    candidate = (BACKEND_DIR.parent / "frontend").resolve()
    return candidate if candidate.is_dir() else None


def add_bundled_frontend_sources_to_zip(
    zf: zipfile.ZipFile,
    settings: Settings,
    template_slug: str,
    asset_arcs: set[str],
    *,
    assets_dir: str,
) -> None:
    """Append SPA snapshot files under ``{assets_dir}/from-frontend/`` when available."""
    rel_paths = BUNDLED_STATIC_FILES_BY_TEMPLATE_SLUG.get(template_slug)
    if not rel_paths:
        return

    fe_root = resolve_template_export_frontend_root(settings)
    prefix = f"{assets_dir}/from-frontend/"

    if fe_root is None:
        note_arc = f"{prefix}EXPORT_ROOT_MISSING.txt"
        if note_arc not in asset_arcs:
            zf.writestr(note_arc, MONOREPO_FRONTEND_MISSING)
            asset_arcs.add(note_arc)
        return

    added = 0
    skipped: list[str] = []
    for rel in rel_paths:
        key = rel.replace("\\", "/").strip().lstrip("/")
        if not key or ".." in Path(key).parts:
            continue
        src = (fe_root / key).resolve()
        try:
            src.relative_to(fe_root.resolve())
        except ValueError:
            continue
        if not src.is_file():
            skipped.append(key)
            continue
        arc = f"{prefix}{key}"
        if arc in asset_arcs:
            continue
        zf.write(src, arcname=arc)
        asset_arcs.add(arc)
        added += 1

    readme_arc = f"{prefix}README.txt"
    if readme_arc not in asset_arcs:
        zf.writestr(readme_arc, FROM_FRONTEND_README)
        asset_arcs.add(readme_arc)

    if skipped and added == 0:
        miss_arc = f"{prefix}MISSING_FILES.txt"
        body = (
            "None of the expected SPA files were found under the frontend root.\n"
            "Expected paths:\n  - "
            + "\n  - ".join(skipped)
            + "\n\nCheck TEMPLATE_EXPORT_FRONTEND_ROOT or place the monorepo ``frontend`` next to ``backend``.\n"
        )
        if miss_arc not in asset_arcs:
            zf.writestr(miss_arc, body)
            asset_arcs.add(miss_arc)
    elif skipped:
        arc = f"{prefix}_partial_export_note.txt"
        body = (
            "Some expected files were missing (often an image not committed yet):\n  - "
            + "\n  - ".join(skipped)
            + "\n"
        )
        if arc not in asset_arcs:
            zf.writestr(arc, body)
            asset_arcs.add(arc)
