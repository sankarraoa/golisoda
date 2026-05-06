"""Version-aware aggregates and question definitions from survey snapshots."""

from collections import defaultdict
from collections.abc import Iterable
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import QuestionType
from app.models.response import Response, ResponseAnswer
from app.models.survey import SurveyVersion

MAX_TEXT_SAMPLES = 5
TEXT_SAMPLE_MAX_LEN = 200


def question_definitions_from_snapshot(schema_snapshot: dict) -> list[dict]:
    questions = []
    for raw in schema_snapshot.get("questions", []):
        questions.append(
            {
                "question_key": raw["question_key"],
                "question_type": raw["question_type"],
                "prompt": raw.get("prompt", raw["question_key"]),
                "sort_order": raw.get("sort_order", 0),
                "options": raw.get("options") or [],
            }
        )
    questions.sort(key=lambda q: (q["sort_order"], q["question_key"]))
    return questions


def _norm_scalar_for_bucket(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    return None


def _iter_multi_values(value: object) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, list):
        return tuple(str(item) for item in value if item is not None and str(item))
    return (str(value),)


def _option_label_map(question: dict) -> dict[str, str]:
    return {opt["value"]: opt.get("label") or opt["value"] for opt in (question.get("options") or [])}


def compute_question_aggregate(
    *,
    question: dict | None,
    question_key: str,
    stored_type: str,
    entries: list[tuple[object, bool]],
    total_responses_in_cohort: int,
) -> dict:
    """Build one QuestionAggregate-compatible dict."""
    prompt = question["prompt"] if question else question_key
    q_type = question["question_type"] if question else stored_type
    sort_order = int(question["sort_order"]) if question else 9999
    option_labels = _option_label_map(question) if question else {}

    non_null = [(v, pii) for v, pii in entries if v is not None]
    answered = len(non_null)

    average: float | None = None
    min_value: float | None = None
    max_value: float | None = None
    distribution: list[dict[str, float | int]] = []
    choice_counts: list[dict[str, str | int | None]] = []
    text_samples: list[str] = []
    text_sample_count = 0

    try:
        qt = QuestionType(q_type)
    except ValueError:
        qt = None

    numeric_types = {
        QuestionType.NPS,
        QuestionType.CSAT_5,
        QuestionType.CSAT_4,
        QuestionType.CSAT_2,
    }
    text_like = {
        QuestionType.PLAIN_TEXT,
        QuestionType.SHORT_TEXT,
        QuestionType.EMAIL,
        QuestionType.PHONE,
    }

    if qt in numeric_types:
        nums: list[float] = []
        bucket: dict[float, int] = defaultdict(int)
        for val, _pii in non_null:
            n = _norm_scalar_for_bucket(val)
            if n is not None:
                nums.append(n)
                bucket[n] += 1
        if nums:
            average = round(sum(nums) / len(nums), 2)
            min_value = min(nums)
            max_value = max(nums)
        distribution = [{"value": k, "count": c} for k, c in sorted(bucket.items(), key=lambda x: x[0])]

    elif qt == QuestionType.MULTI_SELECTION or q_type == "multi_selection":
        choice_totals: dict[str, int] = defaultdict(int)
        for val, pii in non_null:
            if pii:
                continue
            for choice in _iter_multi_values(val):
                choice_totals[choice] += 1
        choice_counts = [
            {"value": value, "label": option_labels.get(value), "count": count}
            for value, count in sorted(choice_totals.items(), key=lambda x: (-x[1], x[0]))
        ]

    elif qt in (QuestionType.SINGLE_SELECTION, QuestionType.DROPDOWN) or q_type in (
        "single_selection",
        "dropdown",
    ):
        choice_totals = defaultdict(int)
        for val, pii in non_null:
            if pii:
                continue
            choice_totals[str(val)] += 1
        choice_counts = [
            {"value": value, "label": option_labels.get(value), "count": count}
            for value, count in sorted(choice_totals.items(), key=lambda x: (-x[1], x[0]))
        ]

    elif qt in text_like:
        for val, pii in non_null:
            if pii:
                text_sample_count += 1
                continue
            text_sample_count += 1
            s = str(val).strip()
            if s and len(text_samples) < MAX_TEXT_SAMPLES:
                clipped = s[:TEXT_SAMPLE_MAX_LEN]
                text_samples.append(clipped + ("…" if len(s) > TEXT_SAMPLE_MAX_LEN else ""))
    else:
        for val, pii in non_null:
            if pii:
                continue
            s = str(val).strip()
            if s:
                text_sample_count += 1
                if len(text_samples) < MAX_TEXT_SAMPLES:
                    clipped = s[:TEXT_SAMPLE_MAX_LEN]
                    text_samples.append(clipped + ("…" if len(s) > TEXT_SAMPLE_MAX_LEN else ""))

    return {
        "question_key": question_key,
        "question_type": q_type,
        "prompt": prompt,
        "sort_order": sort_order,
        "answered_count": answered,
        "cohort_response_count": total_responses_in_cohort,
        "average": average,
        "min_value": min_value,
        "max_value": max_value,
        "distribution": distribution,
        "choice_counts": choice_counts,
        "text_sample_count": text_sample_count,
        "text_samples": text_samples,
    }


async def load_versions_map(
    session: AsyncSession, tenant_id: UUID, version_ids: Iterable[UUID]
) -> dict[UUID, SurveyVersion]:
    ids = list({v for v in version_ids})
    if not ids:
        return {}
    rows = await session.scalars(
        select(SurveyVersion).where(SurveyVersion.tenant_id == tenant_id, SurveyVersion.id.in_(ids))
    )
    return {ver.id: ver for ver in rows}


def base_response_filter(
    tenant_id: UUID,
    *,
    channel_id: UUID | None = None,
    survey_version_id: UUID | None = None,
    submitted_after=None,
    submitted_before=None,
    location_ids: list[UUID] | None = None,
) -> list:
    conds = [Response.tenant_id == tenant_id]
    if channel_id is not None:
        conds.append(Response.channel_id == channel_id)
    if survey_version_id is not None:
        conds.append(Response.survey_version_id == survey_version_id)
    if submitted_after is not None:
        conds.append(Response.submitted_at >= submitted_after)
    if submitted_before is not None:
        conds.append(Response.submitted_at <= submitted_before)
    if location_ids:
        conds.append(Response.location_id.in_(location_ids))
    return conds


async def aggregate_channel_responses(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    channel_id: UUID,
    submitted_after=None,
    submitted_before=None,
    location_ids: list[UUID] | None = None,
) -> dict:
    """Return serializable aggregate report for one channel (cohorts by survey version)."""
    conds = base_response_filter(
        tenant_id,
        channel_id=channel_id,
        submitted_after=submitted_after,
        submitted_before=submitted_before,
        location_ids=location_ids,
    )
    ans_stmt: Select = (
        select(
            Response.id,
            Response.survey_version_id,
            ResponseAnswer.question_key,
            ResponseAnswer.question_type,
            ResponseAnswer.value_json,
            ResponseAnswer.is_pii,
        )
        .join(ResponseAnswer, ResponseAnswer.response_id == Response.id)
        .where(*conds)
    )
    rows = (await session.execute(ans_stmt)).all()

    resp_count_stmt = (
        select(Response.survey_version_id, func.count(Response.id)).where(*conds).group_by(Response.survey_version_id)
    )
    resp_count_rows = (await session.execute(resp_count_stmt)).all()
    survey_version_counts: dict[UUID, int] = {
        sv_id: int(cnt) for sv_id, cnt in resp_count_rows if cnt is not None
    }

    version_responses: dict[UUID, set[UUID]] = defaultdict(set)
    vq_entries: dict[tuple[UUID, str], list[tuple[object, bool]]] = defaultdict(list)
    vq_type: dict[tuple[UUID, str], str] = {}

    for response_id, sv_id, qk, qtype, val, pii in rows:
        version_responses[sv_id].add(response_id)
        vq_entries[(sv_id, qk)].append((val, pii))
        vq_type[(sv_id, qk)] = qtype

    unique_version_ids = set(survey_version_counts.keys()) | set(version_responses.keys())
    versions = await load_versions_map(session, tenant_id, unique_version_ids)

    def cohort_sort_key(vid: UUID) -> int:
        v = versions.get(vid)
        return -(v.version_number if v else 0)

    cohorts: list[dict] = []
    for sv_id in sorted(unique_version_ids, key=cohort_sort_key):
        ver = versions.get(sv_id)
        if ver is None:
            continue
        snap = ver.schema_snapshot or {}
        survey_block = snap.get("survey") or {}
        q_ordered = question_definitions_from_snapshot(snap)
        seen_keys: set[str] = set()
        questions_out: list[dict] = []
        response_count = survey_version_counts.get(sv_id, len(version_responses[sv_id]))
        for q_def in q_ordered:
            key = q_def["question_key"]
            seen_keys.add(key)
            entries = vq_entries.get((sv_id, key), [])
            questions_out.append(
                compute_question_aggregate(
                    question=q_def,
                    question_key=key,
                    stored_type=vq_type.get((sv_id, key), q_def["question_type"]),
                    entries=entries,
                    total_responses_in_cohort=response_count,
                )
            )

        for (vid, key), entries in vq_entries.items():
            if vid != sv_id or key in seen_keys:
                continue
            questions_out.append(
                compute_question_aggregate(
                    question=None,
                    question_key=key,
                    stored_type=vq_type.get((sv_id, key), "unknown"),
                    entries=entries,
                    total_responses_in_cohort=response_count,
                )
            )

        survey_id_raw = survey_block.get("id")
        survey_uuid = UUID(str(survey_id_raw)) if survey_id_raw else ver.survey_id

        cohorts.append(
            {
                "survey_version_id": sv_id,
                "survey_id": survey_uuid,
                "survey_title": survey_block.get("title") or "",
                "version_number": ver.version_number,
                "response_count": response_count,
                "questions": sorted(questions_out, key=lambda q: (q["sort_order"], q["question_key"])),
            }
        )

    return {"cohorts": cohorts}


async def count_responses(session: AsyncSession, where_clause: list) -> int:
    stmt = select(func.count()).select_from(Response).where(*where_clause)
    return int(await session.scalar(stmt) or 0)


def question_defs_for_versions(versions_map: dict[UUID, SurveyVersion]) -> dict[UUID, list[dict]]:
    out: dict[UUID, list[dict]] = {}
    for vid, ver in versions_map.items():
        out[vid] = question_definitions_from_snapshot(ver.schema_snapshot or {})
    return out
