import { useEffect, useMemo, useState } from "react";

import {
  fetchCsat2AnalyticsDashboard,
  fetchNpsAnalyticsDashboard,
  fetchResponseAggregateReport,
  getStoredAccessToken,
} from "../../../lib/adminApi";
import type {
  Csat2DashboardPayload,
  DashboardData,
  MeResponse,
  NpsDashboardPayload,
  QuestionAggregate,
  ResponseAggregateReport,
  SurveyVersion,
} from "../../../types/admin";

import { Csat2BinaryDashboard } from "./Csat2BinaryDashboard";
import { NpsSurveyDashboard } from "./NpsSurveyDashboard";

/** Question types with no quantitative chart tiles (shown only in Responses explorer elsewhere). */
const EXCLUDED_ANALYTICS_TILE_TYPES = new Set<string>([
  "plain_text",
  "short_text",
  "email",
  "phone",
]);

const ANALYTICS_DASHBOARD_MAX_TILES = 6;

function reportableQuestionTier(questionType: string): number {
  const tiers: Record<string, number> = {
    nps: 0,
    csat_5: 1,
    csat_4: 2,
    csat_2: 3,
    single_selection: 4,
    multi_selection: 5,
    dropdown: 6,
  };
  return tiers[questionType] ?? 99;
}

type Props = {
  dashboardData: DashboardData;
  me: MeResponse | null;
};

function can(me: MeResponse | null, code: string): boolean {
  return Boolean(me?.permission_codes.includes(code));
}

function versionsForSurvey(
  surveyVersions: SurveyVersion[],
  surveyId: string | undefined,
): SurveyVersion[] {
  if (!surveyId) {
    return [];
  }
  return surveyVersions
    .filter((v) => v.survey_id === surveyId)
    .sort((a, b) => b.version_number - a.version_number);
}

function questionTypeLabel(questionType: string): string {
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

function StatStrip({ analytics }: { analytics: DashboardData["analytics"] }) {
  return (
    <div className="analytics-stat-strip">
      <StatMini label="All responses (tenant)" value={analytics.total_responses} />
      <StatMini label="Avg NPS (tenant-wide)" value={analytics.nps_average ?? "—"} />
      <StatMini label="Avg CSAT (tenant-wide)" value={analytics.csat_average ?? "—"} />
      <StatMini label="Active channels" value={analytics.active_channels} />
    </div>
  );
}

function StatMini({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="analytics-stat-mini">
      <div className="analytics-stat-mini-label">{label}</div>
      <div className="analytics-stat-mini-value">{value}</div>
    </div>
  );
}

function CsatLikertReport({ question }: { question: QuestionAggregate }) {
  const total = Math.max(question.answered_count, 1);
  const buckets = [...question.distribution].sort((a, b) => Number(a.value) - Number(b.value));
  const maxPct = buckets.length
    ? Math.max(...buckets.map((b) => (100 * b.count) / total))
    : 0;
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
                {b.count}{" "}
                <span className="muted">({pct.toFixed(1)}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChoiceDistributionReport({ question }: { question: QuestionAggregate }) {
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
                {r.count}{" "}
                <span className="muted">({pct.toFixed(1)}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FallbackNumericReport({ question }: { question: QuestionAggregate }) {
  return (
    <div className="analytics-report-inner">
      <p className="muted">
        Numeric summary · min {question.min_value ?? "—"} · max {question.max_value ?? "—"} · avg{" "}
        {question.average ?? "—"}
      </p>
    </div>
  );
}

export function AnalyticsDashboard({ dashboardData, me }: Props) {
  const { tenant, channels, surveyVersions, analytics } = dashboardData;
  const canLoadCohort = can(me, "response:read");
  const canTrendNps = can(me, "analytics:read");

  const [channelId, setChannelId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [aggregate, setAggregate] = useState<ResponseAggregateReport | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingAgg, setLoadingAgg] = useState(false);

  const [npsExtras, setNpsExtras] = useState<Record<string, NpsDashboardPayload>>({});
  const [csat2Extras, setCsat2Extras] = useState<Record<string, Csat2DashboardPayload>>({});
  const [loadingCharts, setLoadingCharts] = useState(false);

  const channel = useMemo(
    () => channels.find((c) => c.id === channelId) ?? channels[0],
    [channels, channelId],
  );

  const surveyAnchor = surveyVersions.find((v) => v.id === channel?.survey_version_id);
  const surveyTitleGuess = surveyAnchor?.schema_snapshot?.survey?.title ?? "Survey";
  const versionOptions = useMemo(
    () => versionsForSurvey(surveyVersions, surveyAnchor?.survey_id),
    [surveyVersions, surveyAnchor?.survey_id],
  );

  const cohortQuestions = useMemo(() => aggregate?.cohorts[0]?.questions ?? [], [aggregate]);

  const sortedReportableQuestions = useMemo(
    () =>
      [...cohortQuestions]
        .filter((q) => !EXCLUDED_ANALYTICS_TILE_TYPES.has(q.question_type))
        .sort((a, b) => {
          const tier = reportableQuestionTier(a.question_type) - reportableQuestionTier(b.question_type);
          if (tier !== 0) {
            return tier;
          }
          return a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.question_key.localeCompare(b.question_key);
        }),
    [cohortQuestions],
  );

  const dashboardQuestions = useMemo(
    () => sortedReportableQuestions.slice(0, ANALYTICS_DASHBOARD_MAX_TILES),
    [sortedReportableQuestions],
  );

  function renderQuestionInsights(q: QuestionAggregate) {
    if (q.question_type === "nps") {
      if (!canTrendNps) {
        return (
          <div className="analytics-nps-pending-muted muted">
            Detailed NPS trend requires analytics access. Showing cohort summary fields only below.
          </div>
        );
      }
      if (npsExtras[q.question_key]) {
        return <NpsSurveyDashboard compact data={npsExtras[q.question_key]!} />;
      }
      return <div className="analytics-nps-pending-muted muted">Preparing Net Promoter view…</div>;
    }

    if (q.question_type === "csat_2") {
      if (!canTrendNps) {
        return <CsatLikertReport question={q} />;
      }
      if (csat2Extras[q.question_key]) {
        return <Csat2BinaryDashboard compact data={csat2Extras[q.question_key]!} />;
      }
      return <div className="analytics-nps-pending-muted muted">Preparing satisfaction view…</div>;
    }

    if (["csat_5", "csat_4"].includes(q.question_type)) {
      return <CsatLikertReport question={q} />;
    }

    if (["single_selection", "multi_selection", "dropdown"].includes(q.question_type)) {
      return <ChoiceDistributionReport question={q} />;
    }

    return <FallbackNumericReport question={q} />;
  }

  useEffect(() => {
    const firstCh = channels[0]?.id ?? "";
    setChannelId((prev) =>
      prev && channels.some((c) => c.id === prev) ? prev : firstCh,
    );
  }, [channels]);

  useEffect(() => {
    if (!channel?.survey_version_id) {
      setVersionId("");
      return;
    }
    setVersionId((prev) => {
      const stillValid =
        prev && versionOptions.some((v) => v.id === prev)
          ? prev
          : versionOptions.some((v) => v.id === channel.survey_version_id)
            ? channel.survey_version_id
            : versionOptions[0]?.id ?? "";
      return stillValid ?? "";
    });
  }, [channel, versionOptions]);

  useEffect(() => {
    if (!canLoadCohort || !channelId || !versionId) {
      setAggregate(null);
      return;
    }
    let cancelled = false;
    async function load() {
      const token = getStoredAccessToken();
      if (!token) {
        return;
      }
      setLoadingAgg(true);
      setLoadError(null);
      try {
        const row = await fetchResponseAggregateReport(token, tenant.id, {
          channel_id: channelId,
          survey_version_id: versionId,
        });
        if (!cancelled) {
          setAggregate(row);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Unable to load analytics.");
          setAggregate(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingAgg(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [canLoadCohort, channelId, tenant.id, versionId]);

  const cohortTitle = aggregate?.cohorts[0]?.survey_title;
  const cohortResponses = aggregate?.cohorts[0]?.response_count ?? 0;

  useEffect(() => {
    const npsQuestions = dashboardQuestions.filter((nq) => nq.question_type === "nps");
    const csat2Questions = dashboardQuestions.filter((cq) => cq.question_type === "csat_2");
    if (!canTrendNps || !channelId || !versionId) {
      setNpsExtras({});
      setCsat2Extras({});
      return;
    }
    if (npsQuestions.length === 0 && csat2Questions.length === 0) {
      setNpsExtras({});
      setCsat2Extras({});
      return;
    }
    let cancelled = false;
    async function loadCharts() {
      const token = getStoredAccessToken();
      if (!token) {
        return;
      }
      setLoadingCharts(true);
      try {
        const payloads = await Promise.all([
          ...npsQuestions.map((nq) =>
            fetchNpsAnalyticsDashboard(token, tenant.id, {
              channel_id: channelId,
              survey_version_id: versionId,
              question_key: nq.question_key,
            }),
          ),
          ...csat2Questions.map((cq) =>
            fetchCsat2AnalyticsDashboard(token, tenant.id, {
              channel_id: channelId,
              survey_version_id: versionId,
              question_key: cq.question_key,
            }),
          ),
        ]);
        if (cancelled) {
          return;
        }
        const nextNps: Record<string, NpsDashboardPayload> = {};
        const nextCsat2: Record<string, Csat2DashboardPayload> = {};
        let i = 0;
        for (const nq of npsQuestions) {
          nextNps[nq.question_key] = payloads[i] as NpsDashboardPayload;
          i += 1;
        }
        for (const cq of csat2Questions) {
          nextCsat2[cq.question_key] = payloads[i] as Csat2DashboardPayload;
          i += 1;
        }
        setNpsExtras(nextNps);
        setCsat2Extras(nextCsat2);
      } catch {
        if (!cancelled) {
          setNpsExtras({});
          setCsat2Extras({});
        }
      } finally {
        if (!cancelled) {
          setLoadingCharts(false);
        }
      }
    }
    void loadCharts();
    return () => {
      cancelled = true;
    };
  }, [dashboardQuestions, canTrendNps, channelId, tenant.id, versionId]);

  if (channels.length === 0) {
    return (
      <div className="section-stack">
        <p className="muted">Create a channel linked to a published survey version to analyze responses.</p>
      </div>
    );
  }

  if (!canLoadCohort) {
    return (
      <div className="section-stack">
        <p className="field-error-msg">
          Response read access is required to load channel survey analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="section-stack analytics-scope">
      <StatStrip analytics={analytics} />

      <div className="analytics-dash-filters">
        <div className="analytics-filter-field">
          <label className="field-label" htmlFor="analytics-channel">
            Channel
          </label>
          <select
            className="field-input"
            id="analytics-channel"
            onChange={(e) => setChannelId(e.target.value)}
            value={channelId || channel?.id || ""}
          >
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.name} ({ch.channel_code})
              </option>
            ))}
          </select>
        </div>
        <div className="analytics-filter-field">
          <label className="field-label" htmlFor="analytics-version">
            Survey version
          </label>
          <select
            className="field-input"
            disabled={versionOptions.length === 0}
            id="analytics-version"
            onChange={(e) => setVersionId(e.target.value)}
            value={versionId}
          >
            {versionOptions.length === 0 ? (
              <option value="">No versions</option>
            ) : (
              versionOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version_number} · {cohortTitle ?? surveyTitleGuess}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {loadingAgg ? <p className="muted">Loading cohort…</p> : null}
      {loadError ? <div className="field-error-msg">{loadError}</div> : null}

      {aggregate && cohortQuestions.length > 0 ? (
        <>
          <p className="analytics-cohort-intro muted">
            Cohort <strong>{cohortResponses}</strong> responses · <strong>{cohortQuestions.length}</strong> questions · showing{" "}
            <strong>{dashboardQuestions.length}</strong> quantitative reports ({ANALYTICS_DASHBOARD_MAX_TILES}-tile grid).
            Text, email, and phone fields are omitted.
            {sortedReportableQuestions.length > ANALYTICS_DASHBOARD_MAX_TILES ? (
              <>
                {" "}
                (<strong>{sortedReportableQuestions.length - ANALYTICS_DASHBOARD_MAX_TILES}</strong> more qualify but are not
                shown.)
              </>
            ) : null}
          </p>
          {loadingCharts ? <p className="muted small-gap">Loading detailed charts…</p> : null}

          {dashboardQuestions.length === 0 ? (
            <p className="muted">
              No chartable questions in this version (only verbatim or contact-field types present). Capture rating or choice
              questions to populate the grid.
            </p>
          ) : (
            <div className="analytics-question-feed">
              {dashboardQuestions.map((q) => {
                const chartPeriod =
                  q.question_type === "nps"
                    ? npsExtras[q.question_key]?.reporting_period_label
                    : q.question_type === "csat_2"
                      ? csat2Extras[q.question_key]?.reporting_period_label
                      : undefined;
                return (
                  <article className="analytics-report-card" key={q.question_key}>
                    <header className="analytics-report-head">
                      <div>
                        <h3 className="analytics-report-q-title">
                          {q.prompt}
                          {chartPeriod ? (
                            <span className="analytics-report-period"> · {chartPeriod}</span>
                          ) : null}
                        </h3>
                        {q.question_type !== "nps" && q.question_type !== "csat_2" ? (
                          <span className="analytics-report-chip">
                            {questionTypeLabel(q.question_type)} · {q.question_key}
                          </span>
                        ) : null}
                      </div>
                      <span className="analytics-report-muted">
                        Answered by {q.answered_count} / {q.cohort_response_count} cohort responses
                        {chartPeriod ? <span className="analytics-report-period"> · {chartPeriod}</span> : null}
                      </span>
                    </header>

                    <div className="analytics-report-body">{renderQuestionInsights(q)}</div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : null}

      {aggregate && cohortQuestions.length === 0 ? (
        <p className="muted">No questions found for this version — publish a snapshot or capture responses.</p>
      ) : null}
    </div>
  );
}
