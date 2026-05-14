import type { QuestionAggregate } from "../../../types/admin";

export function questionTypeLabel(questionType: string): string {
  const map: Record<string, string> = {
    nps: "NPS",
    csat_5: "CSAT‑5",
    csat_4: "CSAT‑4",
    csat_2: "CSAT‑2",
    single_selection: "Single selection",
    multi_selection: "Multi‑selection",
    dropdown: "Dropdown",
    plain_text: "Plain text",
    short_text: "Short text",
    email: "Email",
    phone: "Phone",
  };
  return map[questionType] ?? questionType;
}

export function CsatLikertReport({ question }: { question: QuestionAggregate }) {
  const total = Math.max(question.answered_count, 1);
  const buckets = [...question.distribution].sort((a, b) => Number(a.value) - Number(b.value));
  const maxPct = buckets.length ? Math.max(...buckets.map((b) => (100 * b.count) / total)) : 0;
  return (
    <div className="analytics-report-inner">
      <p className="analytics-report-headline muted">Average rating: {question.average ?? "—"}</p>
      <div className="analytics-bar-list">
        {buckets.map((b) => {
          const pct = (100 * b.count) / total;
          return (
            <div className="analytics-bar-row" key={String(b.value)}>
              <div className="analytics-bar-label">{b.value}</div>
              <div className="analytics-bar-track">
                <div
                  className="analytics-bar-fill"
                  style={{
                    width: maxPct ? `${Math.max((pct / maxPct) * 100, 4)}%` : "4%",
                    opacity: pct > 0 ? 1 : 0.2,
                  }}
                />
              </div>
              <div className="analytics-bar-num">
                {b.count} <span className="muted">({pct.toFixed(1)}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChoiceDistributionReport({ question }: { question: QuestionAggregate }) {
  const totalSelections = Math.max(question.answered_count, 1);
  const rows = [...question.choice_counts];
  const maxCount = rows.length ? Math.max(...rows.map((r) => r.count)) : 0;
  return (
    <div className="analytics-report-inner">
      <div className="analytics-bar-list">
        {rows.map((r) => {
          const pct = (100 * r.count) / totalSelections;
          return (
            <div className="analytics-bar-row" key={r.value}>
              <div className="analytics-bar-label" title={r.value}>
                {r.label ?? r.value}
              </div>
              <div className="analytics-bar-track">
                <div
                  className="analytics-bar-fill analytics-bar-fill--choice"
                  style={{
                    width: maxCount ? `${Math.max((r.count / maxCount) * 100, 5)}%` : "5%",
                  }}
                />
              </div>
              <div className="analytics-bar-num">
                {r.count} <span className="muted">({pct.toFixed(1)}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FallbackNumericReport({ question }: { question: QuestionAggregate }) {
  return (
    <div className="analytics-report-inner">
      <p className="muted">
        Numeric summary · min {question.min_value ?? "—"} · max {question.max_value ?? "—"} · avg{" "}
        {question.average ?? "—"}
      </p>
    </div>
  );
}
