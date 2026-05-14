import { useEffect, useMemo, useState } from "react";

import {
  fetchCsat2AnalyticsDashboard,
  fetchNpsAnalyticsDashboard,
  fetchResponseAggregateReport,
  getStoredAccessToken,
} from "../../../lib/adminApi";
import type {
  Csat2DashboardPayload,
  MeResponse,
  NpsDashboardPayload,
  QuestionAggregate,
  ResponseAggregateReport,
} from "../../../types/admin";
import {
  ChoiceDistributionReport,
  CsatLikertReport,
  FallbackNumericReport,
  questionTypeLabel,
} from "../analytics/QuestionReportViews";
import { Csat2BinaryDashboard } from "../analytics/Csat2BinaryDashboard";
import { NpsSurveyDashboard } from "../analytics/NpsSurveyDashboard";
import {
  mergeQuestionsByType,
  representativeQuestionKeys,
} from "./mergeQuestionAggregates";

const DASHBOARD_REPORT_TYPES = [
  "nps",
  "csat_5",
  "csat_4",
  "csat_2",
  "single_selection",
  "multi_selection",
  "dropdown",
] as const;

type ReportType = (typeof DASHBOARD_REPORT_TYPES)[number];

function can(me: MeResponse | null, code: string): boolean {
  return Boolean(me?.permission_codes.includes(code));
}

function renderMergedBody(
  q: QuestionAggregate,
  opts: {
    canAnalytics: boolean;
    npsExtra: NpsDashboardPayload | null;
    csat2Extra: Csat2DashboardPayload | null;
  },
) {
  if (q.question_type === "nps") {
    if (opts.canAnalytics && opts.npsExtra) {
      return <NpsSurveyDashboard compact data={opts.npsExtra} />;
    }
    return <CsatLikertReport question={q} />;
  }
  if (q.question_type === "csat_2") {
    if (opts.canAnalytics && opts.csat2Extra) {
      return <Csat2BinaryDashboard compact data={opts.csat2Extra} />;
    }
    return <CsatLikertReport question={q} />;
  }
  if (["csat_5", "csat_4"].includes(q.question_type)) {
    return <CsatLikertReport question={q} />;
  }
  if (["single_selection", "multi_selection", "dropdown"].includes(q.question_type)) {
    return <ChoiceDistributionReport question={q} />;
  }
  return <FallbackNumericReport question={q} />;
}

type Props = {
  tenantId: string;
  me: MeResponse | null;
};

export function DashboardReportsGrid({ tenantId, me }: Props) {
  const canResponse = can(me, "response:read");
  const canAnalytics = can(me, "analytics:read");

  const [aggregate, setAggregate] = useState<ResponseAggregateReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [npsTenant, setNpsTenant] = useState<NpsDashboardPayload | null>(null);
  const [csat2Tenant, setCsat2Tenant] = useState<Csat2DashboardPayload | null>(null);

  useEffect(() => {
    if (!canResponse || !tenantId) {
      setAggregate(null);
      return;
    }
    let cancelled = false;
    async function load() {
      const token = getStoredAccessToken();
      if (!token) {
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const row = await fetchResponseAggregateReport(token, tenantId, {});
        if (!cancelled) {
          setAggregate(row);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Unable to load reports.");
          setAggregate(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [canResponse, tenantId]);

  const cohorts = useMemo(() => aggregate?.cohorts ?? [], [aggregate]);

  const mergedByType = useMemo(() => {
    const map = new Map<ReportType, QuestionAggregate | null>();
    for (const t of DASHBOARD_REPORT_TYPES) {
      map.set(t, mergeQuestionsByType(cohorts, t));
    }
    return map;
  }, [cohorts]);

  useEffect(() => {
    if (!canAnalytics || !tenantId || cohorts.length === 0) {
      setNpsTenant(null);
      setCsat2Tenant(null);
      return;
    }
    const nKeys = representativeQuestionKeys(cohorts, "nps");
    const c2Keys = representativeQuestionKeys(cohorts, "csat_2");
    const nKey = nKeys.length === 1 ? nKeys[0] : undefined;
    const c2Key = c2Keys.length === 1 ? c2Keys[0] : undefined;
    if (!nKey && !c2Key) {
      setNpsTenant(null);
      setCsat2Tenant(null);
      return;
    }
    let cancelled = false;
    async function loadExtras() {
      const token = getStoredAccessToken();
      if (!token) {
        return;
      }
      try {
        const [nRow, cRow] = await Promise.all([
          nKey
            ? fetchNpsAnalyticsDashboard(token, tenantId, { question_key: nKey })
            : Promise.resolve(null),
          c2Key
            ? fetchCsat2AnalyticsDashboard(token, tenantId, { question_key: c2Key })
            : Promise.resolve(null),
        ]);
        if (!cancelled) {
          setNpsTenant(nRow);
          setCsat2Tenant(cRow);
        }
      } catch {
        if (!cancelled) {
          setNpsTenant(null);
          setCsat2Tenant(null);
        }
      }
    }
    void loadExtras();
    return () => {
      cancelled = true;
    };
  }, [canAnalytics, tenantId, cohorts]);

  if (!canResponse) {
    return (
      <p className="muted dashboard-reports-unavailable">
        Response access is required to view organization-wide survey reports here.
      </p>
    );
  }

  if (loading && !aggregate) {
    return <p className="muted">Loading overview reports…</p>;
  }
  if (loadError) {
    return <div className="field-error-msg">{loadError}</div>;
  }

  const visibleTiles = DASHBOARD_REPORT_TYPES.map((qt) => {
    const q = mergedByType.get(qt);
    if (!q) {
      return null;
    }
    const headline = `Overall · ${questionTypeLabel(qt)}`;
    const npsExtra = qt === "nps" ? npsTenant : null;
    const csat2Extra = qt === "csat_2" ? csat2Tenant : null;

    return (
      <article className="dashboard-report-card analytics-report-card" key={qt}>
        <header className="analytics-report-head dashboard-report-card-head">
          <div>
            <h3 className="analytics-report-q-title dashboard-report-card-title">{headline}</h3>
            <span className="analytics-report-chip">All channels · tenant-wide</span>
          </div>
          <span className="analytics-report-muted">
            {q.answered_count} answers · {q.cohort_response_count} responses in cohort scope
          </span>
        </header>
        <div className="analytics-report-body dashboard-report-card-body">
          {renderMergedBody(q, { canAnalytics, npsExtra, csat2Extra })}
        </div>
      </article>
    );
  }).filter(Boolean);

  if (visibleTiles.length === 0) {
    return (
      <p className="muted">
        No chartable feedback yet. After responses arrive, overall NPS, CSAT, and choice questions appear here
        automatically.
      </p>
    );
  }

  return <div className="dashboard-report-grid">{visibleTiles}</div>;
}
