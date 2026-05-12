"""Theme token schema for survey templates and tenant overrides.

This is a validation layer only. CSS fallbacks handle missing tokens.
"""

from __future__ import annotations

import re
from typing import ClassVar

from pydantic import BaseModel, Field, field_validator


TOKEN_REGISTRY: tuple[str, ...] = (
    # Colors
    "color.background",
    "color.surface",
    "color.text.primary",
    "color.text.secondary",
    "color.brand.primary",
    "color.brand.secondary",
    "color.brand.accent",
    "color.border",
    # Fonts
    "font.body",
    "font.heading",
    "font.size.base",
    # Spacing
    "spacing.page",
    "spacing.question_gap",
    # Radius
    "radius.input",
    "radius.card",
    # Shadows
    "shadow.card",
)


_HEX_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
_RGB_COLOR_RE = re.compile(
    r"^rgba?\(\s*[-\d.]+\s*(?:,\s*[-\d.]+\s*){2}(?:,\s*[-\d.]+\s*)?\)$"
)
_HSL_COLOR_RE = re.compile(
    r"^hsla?\(\s*[-\d.]+\s*(?:deg|rad|turn)?\s*,\s*[-\d.]+%\s*,\s*[-\d.]+%\s*(?:,\s*[-\d.]+\s*)?\)$"
)
_CSS_LENGTH_RE = re.compile(r"^-?(?:\d+|\d*\.\d+)(?:px|rem|em|%|ch)$")


def _is_color(value: str) -> bool:
    return bool(_HEX_COLOR_RE.match(value) or _RGB_COLOR_RE.match(value) or _HSL_COLOR_RE.match(value))


def _is_css_length(value: str) -> bool:
    return bool(_CSS_LENGTH_RE.match(value))


def _is_font_family(value: str) -> bool:
    # Pragmatic: allow any non-empty CSS font-family string; reject obvious injection.
    v = value.strip()
    return bool(v) and ";" not in v and "\n" not in v


def _is_box_shadow(value: str) -> bool:
    v = value.strip()
    if not v or ";" in v or "\n" in v:
        return False
    if v == "none":
        return True
    # Minimal structural check: must include at least two CSS length tokens.
    length_tokens = re.findall(r"-?(?:\d+|\d*\.\d+)(?:px|rem|em|%|ch)", v)
    return len(length_tokens) >= 2


class SurveyThemeConfig(BaseModel):
    tokens: dict[str, str] = Field(default_factory=dict)

    _registry: ClassVar[set[str]] = set(TOKEN_REGISTRY)

    @field_validator("tokens")
    @classmethod
    def validate_tokens(cls, tokens: dict[str, str]) -> dict[str, str]:
        for key, value in tokens.items():
            if key not in cls._registry:
                allowed = ", ".join(TOKEN_REGISTRY)
                raise ValueError(
                    f"Unknown theme token '{key}'. Allowed tokens: {allowed}"
                )
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"Theme token '{key}' must be a non-empty string.")

            if key.startswith("color."):
                if not _is_color(value.strip()):
                    raise ValueError(
                        f"Theme token '{key}' must be a CSS color (hex/rgb(a)/hsl(a))."
                    )
            elif key.startswith("font."):
                if key == "font.size.base":
                    if not _is_css_length(value.strip()):
                        raise ValueError(
                            f"Theme token '{key}' must be a CSS length (px/rem/em/%/ch)."
                        )
                else:
                    if not _is_font_family(value):
                        raise ValueError(
                            f"Theme token '{key}' must be a valid CSS font-family string."
                        )
            elif key.startswith("spacing.") or key.startswith("radius."):
                if not _is_css_length(value.strip()):
                    raise ValueError(
                        f"Theme token '{key}' must be a CSS length (px/rem/em/%/ch)."
                    )
            elif key.startswith("shadow."):
                if not _is_box_shadow(value):
                    raise ValueError(
                        f"Theme token '{key}' must be a valid CSS box-shadow value."
                    )

        return tokens

