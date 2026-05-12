import pytest
from pydantic import ValidationError

from app.schemas.survey_theme import SurveyThemeConfig
from app.services.surveys import resolve_effective_theme


def test_survey_theme_accepts_valid_partial_theme() -> None:
    cfg = SurveyThemeConfig(
        tokens={
            "color.brand.primary": "#1a73e8",
            "spacing.page": "24px",
            "shadow.card": "0 1px 2px rgba(0,0,0,0.2)",
            "font.body": '"Google Sans", system-ui, sans-serif',
            "font.size.base": "14px",
        }
    )
    assert cfg.tokens["color.brand.primary"] == "#1a73e8"


def test_survey_theme_rejects_unknown_key_with_name() -> None:
    with pytest.raises(ValidationError) as exc:
        SurveyThemeConfig(tokens={"color.brand.tertiary": "#fff"})
    assert "Unknown theme token 'color.brand.tertiary'" in str(exc.value)


@pytest.mark.parametrize("value", ["nope", "#12", "rgb(1,2)", "hsl(10, 10, 10)"])
def test_survey_theme_rejects_malformed_color(value: str) -> None:
    with pytest.raises(ValidationError):
        SurveyThemeConfig(tokens={"color.brand.primary": value})


def test_resolve_effective_theme_empty_theme_and_overrides() -> None:
    template = type("T", (), {"theme": {}})()
    branding = type(
        "B", (), {"theme_overrides": {}, "primary_color": None, "secondary_color": None}
    )()
    assert resolve_effective_theme(template, branding) == {}


def test_resolve_effective_theme_template_only() -> None:
    template = type("T", (), {"theme": {"color.brand.primary": "#111"}})()
    branding = type(
        "B", (), {"theme_overrides": {}, "primary_color": None, "secondary_color": None}
    )()
    assert resolve_effective_theme(template, branding) == {"color.brand.primary": "#111"}


def test_resolve_effective_theme_tenant_overrides_override_template() -> None:
    template = type("T", (), {"theme": {"color.brand.primary": "#111", "color.border": "#222"}})()
    branding = type(
        "B",
        (),
        {
            "theme_overrides": {"color.brand.primary": "#333"},
            "primary_color": None,
            "secondary_color": None,
        },
    )()
    assert resolve_effective_theme(template, branding) == {
        "color.brand.primary": "#333",
        "color.border": "#222",
    }


def test_resolve_effective_theme_legacy_branding_suppresses_brand_tokens() -> None:
    template = type(
        "T",
        (),
        {"theme": {"color.brand.primary": "#111", "color.brand.secondary": "#222"}},
    )()
    branding = type(
        "B",
        (),
        {
            "theme_overrides": {"color.brand.primary": "#333", "color.brand.secondary": "#444"},
            "primary_color": "#ff0000",
            "secondary_color": "#00ff00",
        },
    )()
    assert resolve_effective_theme(template, branding) == {}

