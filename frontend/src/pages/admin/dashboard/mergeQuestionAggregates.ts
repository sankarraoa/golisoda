import type { QuestionAggregate, VersionCohortAggregate } from "../../../types/admin";

/** Collect fragments of questions that share `question_type` across all cohorts. */
export function fragmentsForQuestionType(
  cohorts: VersionCohortAggregate[],
  questionType: string,
): QuestionAggregate[] {
  return cohorts.flatMap((c) => c.questions.filter((q) => q.question_type === questionType));
}

/** First question key with answers for type (stable enough for scoped analytics APIs). */
export function representativeQuestionKeys(
  cohorts: VersionCohortAggregate[],
  questionType: string,
): string[] {
  const keys = new Set<string>();
  for (const c of cohorts) {
    for (const q of c.questions) {
      if (q.question_type === questionType && q.answered_count > 0) {
        keys.add(q.question_key);
      }
    }
  }
  return [...keys].sort();
}

function numericMerge(fragments: QuestionAggregate[]): QuestionAggregate {
  const head = fragments[0]!;
  const bucketMap = new Map<number, number>();
  let minV: number | null = null;
  let maxV: number | null = null;

  for (const p of fragments) {
    if (p.min_value != null) {
      minV = minV === null ? p.min_value : Math.min(minV, p.min_value);
    }
    if (p.max_value != null) {
      maxV = maxV === null ? p.max_value : Math.max(maxV, p.max_value);
    }
    for (const d of p.distribution) {
      const key = typeof d.value === "number" ? d.value : Number(d.value);
      bucketMap.set(key, (bucketMap.get(key) ?? 0) + d.count);
    }
  }

  const distribution = [...bucketMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, count]) => ({ value, count }));

  let total = 0;
  let weighted = 0;
  for (const [v, c] of bucketMap) {
    total += c;
    weighted += v * c;
  }
  const average = total > 0 ? Math.round((weighted / total) * 100) / 100 : null;

  const cohortResponses = fragments.reduce((s, p) => s + p.cohort_response_count, 0);
  const answered = fragments.reduce((s, p) => s + p.answered_count, 0);

  return {
    ...head,
    question_key: `merged_${head.question_type}`,
    prompt: head.prompt,
    answered_count: answered,
    cohort_response_count: cohortResponses,
    average,
    min_value: minV,
    max_value: maxV,
    distribution,
    choice_counts: [],
    text_sample_count: 0,
    text_samples: [],
  };
}

function choiceMerge(fragments: QuestionAggregate[]): QuestionAggregate {
  const head = fragments[0]!;
  const acc = new Map<string, { label: string | null; count: number }>();
  for (const p of fragments) {
    for (const row of p.choice_counts) {
      const cur = acc.get(row.value) ?? { label: row.label, count: 0 };
      acc.set(row.value, {
        label: cur.label ?? row.label ?? null,
        count: cur.count + row.count,
      });
    }
  }
  const choice_counts = [...acc.entries()]
    .map(([value, { label, count }]) => ({ value, label, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  const answered = fragments.reduce((s, p) => s + p.answered_count, 0);
  const cohortResponses = fragments.reduce((s, p) => s + p.cohort_response_count, 0);

  return {
    ...head,
    question_key: `merged_${head.question_type}`,
    answered_count: answered,
    cohort_response_count: cohortResponses,
    distribution: [],
    average: null,
    min_value: null,
    max_value: null,
    choice_counts,
    text_sample_count: 0,
    text_samples: [],
  };
}

/** Merge tenant-wide aggregates for dashboard tiles; returns null if no data for type. */
export function mergeQuestionsByType(
  cohorts: VersionCohortAggregate[],
  questionType: string,
): QuestionAggregate | null {
  const fr = fragmentsForQuestionType(cohorts, questionType);
  if (fr.length === 0) {
    return null;
  }
  const anyData =
    fr.some((q) => q.answered_count > 0) ||
    fr.some((q) => q.distribution.length > 0) ||
    fr.some((q) => q.choice_counts.length > 0);
  if (!anyData) {
    return null;
  }

  if (["nps", "csat_5", "csat_4", "csat_2"].includes(questionType)) {
    return numericMerge(fr);
  }
  if (["single_selection", "multi_selection", "dropdown"].includes(questionType)) {
    return choiceMerge(fr);
  }

  return numericMerge(fr);
}
