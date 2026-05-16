import { useCallback, useEffect, useMemo, useState } from "react";

import type { ActiveAdminView } from "./auditTrailTenantTypes";
import { fetchTenantAuditLogs, type FetchTenantAuditLogsParams } from "../lib/adminApi";
import { fetchPlatformAuditLogs, type PlatformAuditPage } from "../lib/platformApi";
import type { AuditLogEntry } from "../types/admin";

export type AuditTrailDrawerProps = {
  open: boolean;
  onClose: () => void;
  variant: "tenant" | "platform";
  token: string;
  tenantId?: string;
  activeView?: ActiveAdminView;
  surveyBuilderSurveyId?: string | null;
  detailResourceId?: string | null;
  platformPage?: PlatformAuditPage;
};

const PAGE_SIZE = 40;

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function actorSummary(meta: Record<string, unknown>): string {
  const actor = meta.actor;
  if (actor && typeof actor === "object" && actor !== null) {
    const rec = actor as Record<string, unknown>;
    const name = rec.display_name;
    const email = rec.email;
    if (typeof name === "string" && name.trim()) {
      return typeof email === "string" ? `${name} · ${email}` : name;
    }
    if (typeof email === "string") {
      return email;
    }
  }
  return "—";
}

function buildTenantParams(args: {
  activeView: ActiveAdminView;
  surveyBuilderSurveyId: string | null | undefined;
  detailResourceId: string | null | undefined;
  actionFilter: string;
  q: string;
  offset: number;
}): FetchTenantAuditLogsParams {
  const { activeView, surveyBuilderSurveyId, detailResourceId, actionFilter, q, offset } = args;
  const base: FetchTenantAuditLogsParams = {
    limit: PAGE_SIZE,
    offset,
  };
  if (q.trim()) {
    base.q = q.trim();
  }
  if (actionFilter.trim()) {
    base.action = actionFilter.trim();
  }

  if (activeView === "surveys" && surveyBuilderSurveyId) {
    base.relatedSurveyId = surveyBuilderSurveyId;
    return base;
  }

  if (detailResourceId) {
    base.resourceId = detailResourceId;
    if (activeView === "locations") {
      base.resourceTypes = ["location"];
    } else if (activeView === "channels") {
      base.resourceTypes = ["feedback_channel"];
    } else if (activeView === "users") {
      base.resourceTypes = ["user"];
    } else if (activeView === "roles") {
      base.resourceTypes = ["role"];
    }
    return base;
  }

  switch (activeView) {
    case "surveys":
      base.resourceTypes = ["survey", "survey_version", "question"];
      break;
    case "channels":
      base.resourceTypes = ["feedback_channel"];
      break;
    case "locations":
      base.resourceTypes = ["location"];
      break;
    case "users":
      base.resourceTypes = ["user"];
      break;
    case "roles":
      base.resourceTypes = ["role"];
      break;
    case "organization":
      base.resourceTypes = ["tenant", "tenant_branding"];
      break;
    default:
      break;
  }
  return base;
}

const VIEW_LABELS: Partial<Record<ActiveAdminView, string>> = {
  dashboard: "Dashboard (all activity)",
  surveys: "Surveys",
  channels: "Channels",
  locations: "Locations",
  users: "Users",
  roles: "Roles",
  organization: "Organization & branding",
  templates: "Templates gallery",
  responses: "Responses",
  analytics: "Analytics",
};

export function AuditTrailDrawer({
  open,
  onClose,
  variant,
  token,
  tenantId,
  activeView = "dashboard",
  surveyBuilderSurveyId,
  detailResourceId,
  platformPage = "tenants",
}: AuditTrailDrawerProps) {
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [offset, setOffset] = useState(0);

  const filterResetKey = useMemo(
    () =>
      JSON.stringify({
        variant,
        tenantId,
        activeView,
        surveyBuilderSurveyId,
        detailResourceId,
        platformPage,
        debouncedQ: debouncedQ.trim(),
        action: actionFilter.trim(),
      }),
    [
      actionFilter,
      activeView,
      debouncedQ,
      detailResourceId,
      platformPage,
      surveyBuilderSurveyId,
      tenantId,
      variant,
    ],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(searchInput), 320);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setOffset(0);
    setRows([]);
  }, [filterResetKey, open]);

  const tenantParams = useMemo(
    () =>
      buildTenantParams({
        activeView,
        surveyBuilderSurveyId,
        detailResourceId,
        actionFilter,
        q: debouncedQ,
        offset,
      }),
    [activeView, surveyBuilderSurveyId, detailResourceId, actionFilter, debouncedQ, offset],
  );

  const fetchPage = useCallback(async () => {
    if (!open || !token) {
      return;
    }
    if (variant === "tenant" && !tenantId) {
      setLoadError("Missing tenant context.");
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      if (variant === "tenant") {
        const next = await fetchTenantAuditLogs(token, tenantId!, tenantParams);
        setRows((prev) => (offset === 0 ? next : [...prev, ...next]));
      } else {
        const next = await fetchPlatformAuditLogs(token, {
          page: platformPage,
          action: actionFilter.trim() || undefined,
          q: debouncedQ.trim() || undefined,
          limit: PAGE_SIZE,
          offset,
        });
        setRows((prev) => (offset === 0 ? next : [...prev, ...next]));
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load audit trail.");
      if (offset === 0) {
        setRows([]);
      }
    } finally {
      setLoading(false);
    }
  }, [
    actionFilter,
    debouncedQ,
    offset,
    open,
    platformPage,
    tenantId,
    tenantParams,
    token,
    variant,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void (async () => {
      await fetchPage();
      if (cancelled) {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage, open]);

  const scopeLabel = useMemo(() => {
    if (variant === "platform") {
      return platformPage === "templates"
        ? "Templates"
        : platformPage === "users"
          ? "Super administrators"
          : "Tenants";
    }
    if (activeView === "surveys" && surveyBuilderSurveyId) {
      return "This survey";
    }
    if (detailResourceId) {
      if (activeView === "locations") return "This location";
      if (activeView === "channels") return "This channel";
      if (activeView === "users") return "This user";
      if (activeView === "roles") return "This role";
    }
    return VIEW_LABELS[activeView] ?? activeView;
  }, [activeView, detailResourceId, platformPage, surveyBuilderSurveyId, variant]);

  if (!open) {
    return null;
  }

  const lastPageFull = rows.length > 0 && rows.length % PAGE_SIZE === 0;
  const showLoadMore = lastPageFull && !loading && rows.length >= PAGE_SIZE;

  return (
    <div className="audit-trail-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="audit-trail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-trail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="audit-trail-panel-header">
          <div>
            <h2 id="audit-trail-title" className="audit-trail-panel-title">
              Audit trail
            </h2>
            <p className="audit-trail-panel-scope text-sm text-secondary">
              Showing activity for: <strong>{scopeLabel}</strong>
            </p>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={onClose}
            aria-label="Close audit trail"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="audit-trail-filters">
          <div className="field audit-trail-field">
            <label className="field-label" htmlFor="audit-search">
              Search
            </label>
            <input
              id="audit-search"
              className="field-input"
              placeholder="Action, actor, resource, JSON…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="field audit-trail-field">
            <label className="field-label" htmlFor="audit-action">
              Action
            </label>
            <input
              id="audit-action"
              className="field-input"
              placeholder="e.g. survey_updated"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            />
          </div>
        </div>

        {loadError ? <div className="field-error-msg audit-trail-error">{loadError}</div> : null}

        <div className="audit-trail-list" role="list">
          {rows.length === 0 && !loading ? (
            <p className="muted audit-trail-empty">No events match the current filters.</p>
          ) : null}
          {rows.map((row) => (
            <article key={row.id} className="audit-trail-row" role="listitem">
              <div className="audit-trail-row-top">
                <span className="audit-trail-badge">{row.action}</span>
                <span className="audit-trail-time">{formatWhen(row.occurred_at)}</span>
              </div>
              <div className="audit-trail-row-meta text-sm text-secondary">
                {row.resource_type ? (
                  <span>
                    {row.resource_type}
                    {row.resource_id ? ` · ${row.resource_id.slice(0, 8)}…` : ""}
                  </span>
                ) : (
                  <span>—</span>
                )}
                <span className="audit-trail-outcome">{row.outcome}</span>
              </div>
              <div className="audit-trail-actor text-sm">{actorSummary(row.metadata)}</div>
              <details className="audit-trail-details">
                <summary>Details</summary>
                <pre className="audit-trail-json">{JSON.stringify(row.metadata, null, 2)}</pre>
              </details>
            </article>
          ))}
        </div>

        <footer className="audit-trail-footer">
          {loading ? <span className="muted text-sm">Loading…</span> : null}
          {showLoadMore ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              Load more
            </button>
          ) : null}
        </footer>
      </aside>
    </div>
  );
}
