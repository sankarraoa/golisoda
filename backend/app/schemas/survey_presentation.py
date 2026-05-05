"""Validated JSON shape for survey_templates.presentation (version boundary per template row)."""

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class NpsPresentationBlock(BaseModel):
    presentation: Literal["numeric", "segmented"] = "numeric"


Renderer5 = Literal["numeric", "stars", "emoji_5", "color_scale"]
Renderer4 = Literal["numeric", "stars", "emoji_4", "color_scale"]
Renderer2 = Literal["numeric", "thumbs", "emoji_2", "yes_no"]


class Csat5PresentationBlock(BaseModel):
    renderer: Renderer5 = "emoji_5"


class Csat4PresentationBlock(BaseModel):
    renderer: Renderer4 = "emoji_4"


class Csat2PresentationBlock(BaseModel):
    renderer: Renderer2 = "thumbs"


class ProgressBlock(BaseModel):
    style: Literal["bar", "dots", "none"] = "bar"


class NavigationBlock(BaseModel):
    auto_advance: bool = False


class TouchBlock(BaseModel):
    large_targets: bool = False


class SurveyPresentationConfig(BaseModel):
    layout: Literal["stepper", "single_page"] = "stepper"
    nps: NpsPresentationBlock = Field(default_factory=NpsPresentationBlock)
    csat_5: Csat5PresentationBlock = Field(default_factory=Csat5PresentationBlock)
    csat_4: Csat4PresentationBlock = Field(default_factory=Csat4PresentationBlock)
    csat_2: Csat2PresentationBlock = Field(default_factory=Csat2PresentationBlock)
    progress: ProgressBlock = Field(default_factory=ProgressBlock)
    navigation: NavigationBlock = Field(default_factory=NavigationBlock)
    touch: TouchBlock = Field(default_factory=TouchBlock)

    @model_validator(mode="before")
    @classmethod
    def _merge_legacy_csat(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        merged = dict(data)
        legacy_block = merged.pop("csat", None)
        if all(k in merged for k in ("csat_5", "csat_4", "csat_2")):
            return merged
        lp = "digits"
        if isinstance(legacy_block, dict):
            lp = legacy_block.get("presentation", "digits")
        # Legacy "digits" meant numbered scales — product default is emoji + caption stacks (no 1–5 UI).
        pres_map5 = {"digits": "emoji_5", "stars": "stars", "emoji": "emoji_5"}
        pres_map4 = {"digits": "emoji_4", "stars": "stars", "emoji": "emoji_4"}
        pres_map2 = {"digits": "thumbs", "stars": "numeric", "emoji": "emoji_2"}
        merged.setdefault("csat_5", {"renderer": pres_map5.get(lp, "emoji_5")})
        merged.setdefault("csat_4", {"renderer": pres_map4.get(lp, "emoji_4")})
        merged.setdefault("csat_2", {"renderer": pres_map2.get(lp, "thumbs")})
        return merged


def parse_presentation(raw: dict | None) -> SurveyPresentationConfig:
    if raw is None:
        return SurveyPresentationConfig()
    return SurveyPresentationConfig.model_validate(raw)
