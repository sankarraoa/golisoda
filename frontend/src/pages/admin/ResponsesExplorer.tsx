import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchFeedbackResponsesPage,
  fetchResponseAggregateReport,
  getStoredAccessToken,
} from "../../lib/adminApi";
import type {
  Channel,
  FeedbackAnswer,
  FeedbackResponse,
  QuestionAggregate,
  ResponseQuestionDefinition,
  ResponseAggregateReport,
  VersionCohortAggregate,
} from "../../types/admin";

function formatSubmittedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function isoEndOfUtcDay(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(`${dateStr}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function isoStartOfUtcDay(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function formatIndividualAnswer(questionDef: ResponseQuestionDefinition | undefined, answer: FeedbackAnswer): string {
  if (answer.is_pii) {
    return "Hidden (PII)";
  }
  const v = answer.value;
  if (v === undefined || v === null) {
    return "—";
  }
  if (Array.isArray(v)) {
    const labels =
      questionDef?.options.reduce<Record<string, string>>((acc, opt) => {
        acc[opt.value] = opt.label;
        return acc;
      }, {}) ?? {};
    return v.map((item) => labels[String(item)] ?? String(item)).join(", ");
  }
  if (questionDef?.options?.length && typeof v === "string") {
    const opt = questionDef.options.find((o) => o.value === v);
    return opt ? opt.label : v;
  }
  if (typeof v === "object") {
    return JSON.stringify(v);
  }
  return String(v);
}

function answersByKey(answers: FeedbackAnswer[]): Record<string, FeedbackAnswer> {
  const map: Record<string, FeedbackAnswer> = {};
  for (const a of answers) {
    map[a.question_key] = a;
  }
  return map;
}

type TabId = "individual" | "aggregate";

export function ResponsesExplorer({ tenantId, channels }: { tenantId: string; channels: Channel[] }) {
  const token = getStoredAccessToken();
  const channelOptions = useMemo(
    () => [...channels].sort((a, b) => a.name.localeCompare(b.name)),
    [channels],
  );

  const [channelId, setChannelId] = useState<string>("");
  const [surveyVersionFilter, setSurveyVersionFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [tab, setTab] = useState<TabId>("individual");

  const [listPage, setListPage] = useState<{ total: number; items: FeedbackResponse[] } | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const pageSize = 25;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [aggregate, setAggregate] = useState<ResponseAggregateReport | null>(null);
  const [aggregateLoading, setAggregateLoading] = useState(false);
  const [aggregateError, setAggregateError] = useState<string | null>(null);

  const filterParams = useMemo(() => {
    const submitted_after = dateFrom ? isoStartOfUtcDay(dateFrom) : undefined;
    const submitted_before = dateTo ? isoEndOfUtcDay(dateTo) : undefined;
    return { submitted_after, submitted_before };
  }, [dateFrom, dateTo]);

  const loadList = useCallback(async () => {
    if (!token || !tenantId || !channelId) {
      setListPage(null);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const data = await fetchFeedbackResponsesPage(token, tenantId, {
        channel_id: channelId,
        survey_version_id: surveyVersionFilter || undefined,
        submitted_after: filterParams.submitted_after,
        submitted_before: filterParams.submitted_before,
        limit: pageSize,
        offset,
      });
      setListPage({ total: data.total, items: data.items });
    } catch (error) {
      setListPage(null);
      setListError(error instanceof Error ? error.message : "Could not load responses.");
    } finally {
      setListLoading(false);
    }
  }, [channelId, filterParams.submitted_after, filterParams.submitted_before, offset, surveyVersionFilter, tenantId, token]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadAggregate = useCallback(async () => {
    if (!token || !tenantId || !channelId) {
      setAggregate(null);
      return;
    }
    setAggregateLoading(true);
    setAggregateError(null);
    try {
      const data = await fetchResponseAggregateReport(token, tenantId, {
        channel_id: channelId,
        submitted_after: filterParams.submitted_after,
        submitted_before: filterParams.submitted_before,
      });
      setAggregate(data);
    } catch (error) {
      setAggregate(null);
      setAggregateError(error instanceof Error ? error.message : "Could not load aggregate.");
    } finally {
      setAggregateLoading(false);
    }
  }, [channelId, filterParams.submitted_after, filterParams.submitted_before, tenantId, token]);

  useEffect(() => {
    if (tab === "aggregate") {
      void loadAggregate();
    }
  }, [tab, loadAggregate]);

  useEffect(() => {
    setOffset(0);
    setExpandedId(null);
  }, [channelId, dateFrom, dateTo, surveyVersionFilter]);

  const hasMore = listPage !== null && offset + pageSize < listPage.total;
  const cohortsSorted = aggregate?.cohorts ?? [];

  if (!token) {
    return <div className="muted-text">Sign in to view responses.</div>;
  }

  return (
    <div className="responses-explorer">
      <div className="responses-explorer-toolbar">
        <div className="responses-explorer-fields">
          <label className="field-label-secondary">
            Channel
            <select
              className="field-input responses-explorer-channel"
              onChange={(e) => setChannelId(e.target.value)}
              value={channelId}
            >
              <option value="">Select a channel…</option>
              {channelOptions.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label-secondary">
            From (UTC date)
            <input
              className="field-input"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="field-label-secondary">
            To (UTC date)
            <input
              className="field-input"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          {tab === "individual" ? (
            <label className="field-label-secondary">
              Survey version ID (optional)
              <input
                className="field-input"
                placeholder="uuid"
                spellCheck={false}
                type="text"
                value={surveyVersionFilter}
                onChange={(e) => setSurveyVersionFilter(e.target.value.trim())}
              />
            </label>
          ) : null}
        </div>

        <div className="responses-explorer-tabs" role="tablist">
          <button
            className={`filter-chip ${tab === "individual" ? "active" : ""}`}
            type="button"
            role="tab"
            aria-selected={tab === "individual"}
            onClick={() => setTab("individual")}
          >
            Individual
          </button>
          <button
            className={`filter-chip ${tab === "aggregate" ? "active" : ""}`}
            type="button"
            role="tab"
            aria-selected={tab === "aggregate"}
            onClick={() => setTab("aggregate")}
          >
            Aggregate
          </button>
        </div>
      </div>

      {!channelId ? (
        <div className="empty-state-muted">Choose a channel to load responses.</div>
      ) : tab === "individual" ? (
        <>
          {listLoading && !listPage ? (
            <div className="muted-text">Loading…</div>
          ) : listError ? (
            <div className="field-error-msg">{listError}</div>
          ) : listPage === null ? null : (
            <>
              <div className="table-wrap responses-table-wrap">
                <table className="responses-table">
                  <thead>
                    <tr>
                      <th>Submitted</th>
                      <th>Survey</th>
                      <th>Version</th>
                      <th>Location</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {listPage.items.map((response) => {
                      const isOpen = expandedId === response.id;
                      return (
                        <Fragment key={response.id}>
                          <tr className={isOpen ? "responses-row--open" : undefined}>
                            <td>{formatSubmittedAt(response.submitted_at)}</td>
                            <td>
                              <div className="fw-medium">{response.survey_title}</div>
                              <div className="text-xs text-secondary">{response.channel_name}</div>
                            </td>
                            <td>
                              <span className="code-chip">v{response.survey_version_number}</span>
                            </td>
                            <td>{response.location_name}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn--ghost"
                                onClick={() =>
                                  setExpandedId((current) => (current === response.id ? null : response.id))
                                }
                              >
                                {isOpen ? "Collapse" : "Expand"}
                              </button>
                            </td>
                          </tr>
                          {isOpen ? (
                            <tr className="responses-detail-row">
                              <td colSpan={5}>
                                <IndividualResponseDetail response={response} />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                <div className="pagination">
                  <span className="pagination-info">
                    {listPage.total === 0
                      ? "Showing 0 of 0 responses"
                      : listPage.items.length === 0
                        ? `Showing 0 of ${listPage.total} responses`
                        : `Showing ${offset + 1}-${offset + listPage.items.length} of ${listPage.total} responses`}
                    {dateFrom || dateTo ? " (filtered by date)" : ""}
                  </span>
                  <div className="pagination-controls">
                    <button
                      type="button"
                      className="btn btn--secondary"
                      disabled={offset === 0 || listLoading}
                      onClick={() => setOffset((o) => Math.max(0, o - pageSize))}
                    >
                      ← Prev
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      disabled={!hasMore || listLoading}
                      onClick={() => setOffset((o) => o + pageSize)}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {aggregateLoading && !aggregate ? (
            <div className="muted-text">Loading aggregate…</div>
          ) : aggregateError ? (
            <div className="field-error-msg">{aggregateError}</div>
          ) : aggregate ? (
            <AggregatePanels cohorts={cohortsSorted} />
          ) : null}
        </>
      )}
    </div>
  );
}

function IndividualResponseDetail({ response }: { response: FeedbackResponse }) {
  const byKeyMap = answersByKey(response.answers);
  const keysWithDefs = new Set(response.question_definitions.map((q) => q.question_key));

  const orphanAnswers = response.answers.filter((a) => !keysWithDefs.has(a.question_key));

  return (
    <div className="responses-detail-inner">
      <div className="responses-detail-rows">
        {response.question_definitions.map((qd) => {
          const answer = byKeyMap[qd.question_key];
          return (
            <div key={qd.question_key} className="response-detail-block">
              <div className="response-detail-prompt">{qd.prompt}</div>
              <div className="response-detail-value">
                {answer ? formatIndividualAnswer(qd, answer) : <span className="text-secondary">No answer</span>}
              </div>
            </div>
          );
        })}
        {orphanAnswers.map((answer) => (
          <div key={answer.question_key} className="response-detail-block response-detail-block--legacy">
            <div className="response-detail-prompt">Legacy question (not in version snapshot)</div>
            <div className="response-detail-value">{formatIndividualAnswer(undefined, answer)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AggregatePanels({ cohorts }: { cohorts: VersionCohortAggregate[] }) {
  if (cohorts.length === 0) {
    return (
      <div className="empty-state-muted">
        No responses with answers in this range for aggregates. Submit feedback or widen the dates.
      </div>
    );
  }

  return (
    <div className="aggregate-cohorts">
      <p className="responses-explorer-meta text-secondary">
        Aggregates are split by survey version (cohorts). Combining numbers across versions can be misleading when
        questions change.
      </p>
      {cohorts.map((cohort) => (
        <section key={cohort.survey_version_id} className="aggregate-cohort-card">
          <header className="aggregate-cohort-header">
            <h3 className="aggregate-cohort-title">{cohort.survey_title}</h3>
            <span className="code-chip">v{cohort.version_number}</span>
            <span className="muted-text">{cohort.response_count} response(s)</span>
          </header>
          <div className="aggregate-questions">
            {cohort.questions.map((question) => (
              <QuestionAggregateBlock key={question.question_key} question={question} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function QuestionAggregateBlock({ question }: { question: QuestionAggregate }) {
  const numericActive = typeof question.average === "number" && Number.isFinite(question.average);
  const showDistributionBars = question.distribution.length > 0;
  const maxCount = showDistributionBars ? Math.max(...question.distribution.map((b) => b.count), 1) : 1;

  return (
    <div className="aggregate-question">
      <div className="aggregate-question-heading">
        <div className="fw-medium">{question.prompt}</div>
        <div className="text-xs text-secondary">
          {question.question_key} · {question.question_type}
        </div>
      </div>
      <div className="text-sm text-secondary">
        Answered: {question.answered_count}/{question.cohort_response_count}
      </div>

      {numericActive ? (
        <div className="aggregate-numeric">
          Average: <strong>{question.average}</strong>
          {typeof question.min_value === "number" && typeof question.max_value === "number"
            ? ` · min ${question.min_value}, max ${question.max_value}`
            : ""}
        </div>
      ) : null}

      {showDistributionBars ? (
        <div className="aggregate-bars">
          {question.distribution.map((bucket) => (
            <div key={`${bucket.value}`} className="aggregate-bar-row">
              <span className="aggregate-bar-label">{bucket.value}</span>
              <div className="aggregate-bar-track">
                <div
                  className="aggregate-bar-fill"
                  style={{ width: `${(bucket.count / maxCount) * 100}%` }}
                  title={`${bucket.count}`}
                />
              </div>
              <span className="aggregate-bar-count">{bucket.count}</span>
            </div>
          ))}
        </div>
      ) : null}

      {question.choice_counts.length > 0 ? (
        <ul className="aggregate-choice-list">
          {question.choice_counts.map((row) => (
            <li key={row.value}>
              <span className="fw-medium">{row.label ?? row.value}</span>
              <span className="text-secondary"> · {row.count}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {question.text_samples.length > 0 ? (
        <div className="aggregate-text-samples">
          <div className="text-secondary text-xs">Sample text ({question.text_sample_count})</div>
          <ul>
            {question.text_samples.map((line, idx) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
