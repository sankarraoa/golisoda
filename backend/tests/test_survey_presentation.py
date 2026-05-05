import pytest
from pydantic import ValidationError

from app.schemas.survey_presentation import SurveyPresentationConfig


def test_survey_presentation_accepts_partial_payload_with_defaults() -> None:
    cfg = SurveyPresentationConfig.model_validate(
        {"layout": "single_page", "progress": {"style": "none"}},
    )

    assert cfg.layout == "single_page"
    assert cfg.progress.style == "none"
    assert cfg.navigation.auto_advance is False
    assert cfg.csat_5.renderer == "emoji_5"
    assert cfg.csat_4.renderer == "emoji_4"
    assert cfg.csat_2.renderer == "thumbs"


def test_legacy_csat_digits_maps_to_emoji_not_numbered_buttons() -> None:
    cfg = SurveyPresentationConfig.model_validate(
        {"layout": "stepper", "csat": {"presentation": "digits"}},
    )
    assert cfg.csat_5.renderer == "emoji_5"
    assert cfg.csat_4.renderer == "emoji_4"
    assert cfg.csat_2.renderer == "thumbs"


def test_survey_presentation_rejects_invalid_layout() -> None:
    with pytest.raises(ValidationError):
        SurveyPresentationConfig.model_validate({"layout": "invalid"})


def test_survey_presentation_accepts_optional_blocks() -> None:
    SurveyPresentationConfig.model_validate(
        {"layout": "stepper", "touch": {"large_targets": True}},
    )


def test_survey_presentation_merges_legacy_csat_into_scale_renderers() -> None:
    cfg = SurveyPresentationConfig.model_validate(
        {"layout": "stepper", "csat": {"presentation": "emoji"}},
    )
    assert cfg.csat_5.renderer == "emoji_5"
    assert cfg.csat_4.renderer == "emoji_4"
    assert cfg.csat_2.renderer == "emoji_2"


def test_survey_presentation_new_keys_override_legacy_csat() -> None:
    cfg = SurveyPresentationConfig.model_validate(
        {
            "layout": "stepper",
            "csat": {"presentation": "emoji"},
            "csat_5": {"renderer": "stars"},
            "csat_4": {"renderer": "numeric"},
            "csat_2": {"renderer": "yes_no"},
        },
    )
    assert cfg.csat_5.renderer == "stars"
    assert cfg.csat_4.renderer == "numeric"
    assert cfg.csat_2.renderer == "yes_no"
