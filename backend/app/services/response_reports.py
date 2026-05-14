"""Version-aware aggregates and question definitions from survey snapshots."""

from collections import defaultdict
from collections.abc import Iterable
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import QuestionType
from app.models.response import Response, ResponseAnswer
from app.models.survey import SurveyVersion

MAX_TEXT_SAMPLES = 5
TEXT_SAMPLE_MAX_LEN = 200
MONTH_ABBREV = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


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
    return {
        opt["value"]: opt.get("label") or opt["value"]
        for opt in (question.get("options") or [])
    }


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
        distribution = [
            {"value": k, "count": c} for k, c in sorted(bucket.items(), key=lambda x: x[0])
        ]

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
    channel_id: UUID | None = None,
    survey_version_id: UUID | None = None,
    submitted_after=None,
    submitted_before=None,
    location_ids: list[UUID] | None = None,
) -> dict:
    """Return cohort aggregates by survey version for one channel or tenant-wide."""
    conds = base_response_filter(
        tenant_id,
        channel_id=channel_id,
        survey_version_id=survey_version_id,
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
        select(Response.survey_version_id, func.count(Response.id))
        .where(*conds)
        .group_by(Response.survey_version_id)
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
                "questions": sorted(
                    questions_out,
                    key=lambda q: (q["sort_order"], q["question_key"]),
                ),
            }
        )

    return {"cohorts": cohorts}


def _go_back_months(year: int, month: int, back: int) -> tuple[int, int]:
    mm = month
    yy = year
    for _ in range(back):
        mm -= 1
        if mm < 1:
            mm = 12
            yy -= 1
    return yy, mm


def _coerce_nps_score(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    try:
        return float(str(value).strip())
    except (ValueError, TypeError):
        return None


def _classify_nps_segment(score: float) -> str:
    if score >= 9:
        return "promoter"
    if score >= 7:
        return "passive"
    return "detractor"


def _coerce_csat2_yes_no(value: object) -> bool | None:
    """Map stored CSAT-2 value to True=Yes (2) / False=No (1)."""
    n = _coerce_nps_score(value)
    if n is None:
        return None
    if abs(n - 2.0) < 0.001:
        return True
    if abs(n - 1.0) < 0.001:
        return False
    return None


def _nps_pct_triplet(counts: dict[str, int]) -> tuple[float, float, float, int | None]:
    p = int(counts.get("promoter", 0))
    passive_n = int(counts.get("passive", 0))
    d = int(counts.get("detractor", 0))
    total = p + passive_n + d
    if total == 0:
        return 0.0, 0.0, 0.0, None
    pp = round(100.0 * p / total, 1)
    ap = round(100.0 * passive_n / total, 1)
    dp = round(100.0 * d / total, 1)
    raw_nps = (100.0 * p / total) - (100.0 * d / total)
    return pp, ap, dp, int(round(raw_nps))


async def _resolve_prompt_from_versions(
    session: AsyncSession,
    tenant_id: UUID,
    *,
    question_key: str,
    preferred_version_id: UUID | None,
    expected_question_type: str | None,
) -> str:
    if preferred_version_id is not None:
        ver = await session.get(SurveyVersion, preferred_version_id)
        if ver and ver.tenant_id == tenant_id and ver.schema_snapshot:
            for q in question_definitions_from_snapshot(ver.schema_snapshot or {}):
                if q["question_key"] != question_key:
                    continue
                if expected_question_type and q["question_type"] != expected_question_type:
                    continue
                return str(q.get("prompt") or question_key)

    rows = list(
        (
            await session.scalars(
                select(SurveyVersion)
                .where(SurveyVersion.tenant_id == tenant_id)
                .order_by(SurveyVersion.version_number.desc(), SurveyVersion.created_at.desc())
            )
        ).all()
    )
    for ver in rows:
        snap = ver.schema_snapshot or {}
        for q in question_definitions_from_snapshot(snap):
            if q["question_key"] != question_key:
                continue
            if expected_question_type and q["question_type"] != expected_question_type:
                continue
            return str(q.get("prompt") or question_key)
    return question_key


async def build_nps_analytics_dashboard(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    channel_id: UUID | None = None,
    survey_version_id: UUID | None = None,
    question_key: str,
    location_ids: list[UUID] | None = None,
) -> dict:
    """Six-month stacked-bar context + headline snapshot matching tenant analytics UI."""
    conds = base_response_filter(
        tenant_id,
        channel_id=channel_id,
        survey_version_id=survey_version_id,
        location_ids=location_ids,
    )
    stmt = (
        select(Response.submitted_at, ResponseAnswer.value_json)
        .join(ResponseAnswer, ResponseAnswer.response_id == Response.id)
        .where(
            *conds,
            ResponseAnswer.tenant_id == tenant_id,
            ResponseAnswer.question_key == question_key,
            ResponseAnswer.question_type == QuestionType.NPS.value,
            ResponseAnswer.is_pii.is_(False),
        )
    )
    rows = list((await session.execute(stmt)).all())

    scored: list[tuple[datetime, float]] = []
    for submitted_at, val in rows:
        sc = _coerce_nps_score(val)
        if sc is None or not (0 <= sc <= 10):
            continue
        scored.append((submitted_at, sc))

    counts_all: dict[str, int] = defaultdict(int)
    for _, sc in scored:
        counts_all[_classify_nps_segment(sc)] += 1
    pp_all, ap_all, dp_all, nps_snap = _nps_pct_triplet(dict(counts_all))
    total_all = sum(counts_all.values())

    bucket_counts: dict[tuple[int, int], dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for ts, sc in scored:
        ts_eff = ts
        if ts_eff.tzinfo is None:
            ts_eff = ts_eff.replace(tzinfo=UTC)
        ym = (ts_eff.year, ts_eff.month)
        bucket_counts[ym][_classify_nps_segment(sc)] += 1

    now_anchor = datetime.now(UTC)
    months_template: list[dict] = []
    for back in (5, 4, 3, 2, 1, 0):
        yy, mm = _go_back_months(now_anchor.year, now_anchor.month, back)
        ctm = bucket_counts.get((yy, mm), defaultdict(int))
        pp_m, ap_m, dp_m, nps_m = _nps_pct_triplet(dict(ctm))
        total_m = sum(int(ctm[k]) for k in ("promoter", "passive", "detractor"))
        months_template.append(
            {
                "year": yy,
                "month": mm,
                "label": MONTH_ABBREV[mm - 1],
                "response_count": total_m,
                "promoters_pct": pp_m,
                "passives_pct": ap_m,
                "detractors_pct": dp_m,
                "nps": nps_m,
            }
        )

    delta: int | None = None
    if months_template:
        oldest = months_template[0]["nps"]
        newest = months_template[-1]["nps"]
        if oldest is not None and newest is not None:
            delta = newest - oldest

    period_label = (
        f"{months_template[0]['label']} {months_template[0]['year']} – "
        f"{months_template[-1]['label']} {months_template[-1]['year']}"
        if months_template
        else ""
    )

    prompt = await _resolve_prompt_from_versions(
        session,
        tenant_id,
        question_key=question_key,
        preferred_version_id=survey_version_id,
        expected_question_type=QuestionType.NPS.value,
    )

    return {
        "question_key": question_key,
        "prompt": prompt,
        "reporting_period_label": period_label,
        "snapshot": {
            "response_count": total_all,
            "promoters_pct": pp_all,
            "passives_pct": ap_all,
            "detractors_pct": dp_all,
            "nps": nps_snap,
        },
        "nps_delta_vs_period_start": delta,
        "months": months_template,
    }


async def build_csat2_binary_dashboard(
    session: AsyncSession,
    *,
    tenant_id: UUID,
    channel_id: UUID | None = None,
    survey_version_id: UUID | None = None,
    question_key: str,
    location_ids: list[UUID] | None = None,
) -> dict:
    """Yes/No CSAT-2 headline + six-month CSAT % trend (answers only, excludes invalid values)."""
    conds = base_response_filter(
        tenant_id,
        channel_id=channel_id,
        survey_version_id=survey_version_id,
        location_ids=location_ids,
    )
    cohort_total = int(
        await session.scalar(select(func.count()).select_from(Response).where(*conds)) or 0
    )

    stmt = (
        select(Response.submitted_at, ResponseAnswer.value_json)
        .join(ResponseAnswer, ResponseAnswer.response_id == Response.id)
        .where(
            *conds,
            ResponseAnswer.tenant_id == tenant_id,
            ResponseAnswer.question_key == question_key,
            ResponseAnswer.question_type == QuestionType.CSAT_2.value,
            ResponseAnswer.is_pii.is_(False),
        )
    )
    rows = list((await session.execute(stmt)).all())

    scored: list[tuple[datetime, bool]] = []
    for submitted_at, val in rows:
        yn = _coerce_csat2_yes_no(val)
        if yn is None:
            continue
        scored.append((submitted_at, yn))

    yes_all = sum(1 for _, y in scored if y)
    no_all = sum(1 for _, y in scored if not y)
    answered_all = yes_all + no_all
    csat_pct = round(100.0 * yes_all / answered_all, 1) if answered_all else None
    rr_pct = round(100.0 * answered_all / cohort_total, 1) if cohort_total else 0.0

    bucket_counts: dict[tuple[int, int], tuple[int, int]] = {}
    for ts, is_yes in scored:
        ts_eff = ts
        if ts_eff.tzinfo is None:
            ts_eff = ts_eff.replace(tzinfo=UTC)
        ym = (ts_eff.year, ts_eff.month)
        yc, nc = bucket_counts.get(ym, (0, 0))
        if is_yes:
            bucket_counts[ym] = (yc + 1, nc)
        else:
            bucket_counts[ym] = (yc, nc + 1)

    now_anchor = datetime.now(UTC)
    months_template: list[dict] = []
    for back in (5, 4, 3, 2, 1, 0):
        yy, mm = _go_back_months(now_anchor.year, now_anchor.month, back)
        yc, nc = bucket_counts.get((yy, mm), (0, 0))
        tot = yc + nc
        pct_m = round(100.0 * yc / tot, 1) if tot else None
        months_template.append(
            {
                "year": yy,
                "month": mm,
                "label": MONTH_ABBREV[mm - 1],
                "response_count": tot,
                "yes_count": yc,
                "csat_pct": pct_m,
            }
        )

    period_label = (
        f"{months_template[0]['label']} {months_template[0]['year']} – "
        f"{months_template[-1]['label']} {months_template[-1]['year']}"
        if months_template
        else ""
    )

    prompt = await _resolve_prompt_from_versions(
        session,
        tenant_id,
        question_key=question_key,
        preferred_version_id=survey_version_id,
        expected_question_type=QuestionType.CSAT_2.value,
    )

    return {
        "question_key": question_key,
        "prompt": prompt,
        "reporting_period_label": period_label,
        "snapshot": {
            "yes_count": yes_all,
            "no_count": no_all,
            "answered_count": answered_all,
            "cohort_response_count": cohort_total,
            "csat_pct": csat_pct,
            "response_rate_pct": rr_pct,
        },
        "months": months_template,
    }


async def count_responses(session: AsyncSession, where_clause: list) -> int:
    stmt = select(func.count()).select_from(Response).where(*where_clause)
    return int(await session.scalar(stmt) or 0)


def question_defs_for_versions(versions_map: dict[UUID, SurveyVersion]) -> dict[UUID, list[dict]]:
    out: dict[UUID, list[dict]] = {}
    for vid, ver in versions_map.items():
        out[vid] = question_definitions_from_snapshot(ver.schema_snapshot or {})
    return out
