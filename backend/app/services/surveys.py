from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import SurveyStatus, SurveyVersionStatus
from app.models.survey import Question, QuestionOption, Survey, SurveyVersion
from app.models.survey_template import SurveyTemplate
from app.models.tenant import TenantBranding


async def build_schema_snapshot(session: AsyncSession, survey: Survey) -> dict:
    question_rows = await session.scalars(
        select(Question)
        .where(Question.survey_id == survey.id)
        .order_by(Question.sort_order, Question.created_at)
    )
    questions = []
    for question in question_rows:
        option_rows = await session.scalars(
            select(QuestionOption)
            .where(QuestionOption.question_id == question.id)
            .order_by(QuestionOption.sort_order, QuestionOption.created_at)
        )
        questions.append(
            {
                "id": str(question.id),
                "question_key": question.question_key,
                "question_type": question.question_type.value,
                "prompt": question.prompt,
                "help_text": question.help_text,
                "is_required": question.is_required,
                "is_pii": question.is_pii,
                "sort_order": question.sort_order,
                "branching_metadata": question.branching_metadata,
                "options": [
                    {
                        "id": str(option.id),
                        "value": option.value,
                        "label": option.label,
                        "sort_order": option.sort_order,
                    }
                    for option in option_rows
                ],
            }
        )

    return {
        "survey": {
            "id": str(survey.id),
            "title": survey.title,
            "slug": survey.slug,
            "description": survey.description,
            "default_locale": survey.default_locale,
        },
        "questions": questions,
    }


def resolve_effective_theme(template: SurveyTemplate, branding: TenantBranding) -> dict[str, str]:
    """Resolve the theme token set used for public rendering.

    Merge order:
    - Start with `survey_templates.theme` (template defaults)
    - Overlay `tenant_branding.theme_overrides` (tenant wins)

    Transitional behavior (back-compat):
    - If `tenant_branding.primary_color` is set, DO NOT return `color.brand.primary` even if the
      template or overrides define it. The legacy branding columns remain the source of truth
      for tenants who already use them, so their appearance doesn't silently change.
    - Same rule for `tenant_branding.secondary_color` and `color.brand.secondary`.

    TODO: consolidate legacy branding columns into theme_overrides and remove this suppression.
    """

    merged: dict[str, str] = {}
    if isinstance(getattr(template, "theme", None), dict):
        merged.update({k: v for k, v in template.theme.items() if isinstance(k, str) and isinstance(v, str)})
    if isinstance(getattr(branding, "theme_overrides", None), dict):
        merged.update({k: v for k, v in branding.theme_overrides.items() if isinstance(k, str) and isinstance(v, str)})

    if branding.primary_color:
        merged.pop("color.brand.primary", None)
    if branding.secondary_color:
        merged.pop("color.brand.secondary", None)

    return merged


async def publish_survey_version(
    session: AsyncSession,
    *,
    survey: Survey,
    published_by_user_id: UUID,
) -> SurveyVersion:
    snapshot = await build_schema_snapshot(session, survey)
    if not snapshot["questions"]:
        raise ValueError("Cannot publish a survey without questions.")

    latest_version = await session.scalar(
        select(func.max(SurveyVersion.version_number)).where(SurveyVersion.survey_id == survey.id)
    )
    if survey.status == SurveyStatus.PUBLISHED and latest_version is not None:
        raise ValueError("No draft changes to publish.")

    next_version = (latest_version or 0) + 1
    survey.status = SurveyStatus.PUBLISHED
    version = SurveyVersion(
        tenant_id=survey.tenant_id,
        survey_id=survey.id,
        version_number=next_version,
        status=SurveyVersionStatus.PUBLISHED,
        schema_snapshot=snapshot,
        published_at=datetime.now(UTC),
        published_by_user_id=published_by_user_id,
    )
    session.add(version)
    await session.flush()
    return version
