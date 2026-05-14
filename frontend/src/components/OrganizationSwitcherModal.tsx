import { useEffect, useMemo, useRef, useState } from "react";

import { readRecentOrganizations } from "../lib/adminApi";
import type { Tenant } from "../types/admin";

type StatusFilter = "all" | "active" | "inactive";

function tenantMatchesStatus(t: Tenant, filter: StatusFilter): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "active") {
    return t.status === "active";
  }
  return t.status === "suspended" || t.status === "offboarded";
}

function tenantMatchesSearch(t: Tenant, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const hay = [t.name, t.slug, t.address_city, t.address_state, t.default_locale]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

function statusLabel(status: Tenant["status"]): string {
  if (status === "active") {
    return "Active";
  }
  if (status === "suspended") {
    return "Suspended";
  }
  return "Offboarded";
}

function statusBadgeClass(status: Tenant["status"]): string {
  if (status === "active") {
    return "badge badge--success org-switcher-badge";
  }
  if (status === "suspended") {
    return "badge badge--warning org-switcher-badge";
  }
  return "badge badge--neutral org-switcher-badge";
}

export function OrganizationSwitcherModal({
  open,
  activeTenantId,
  tenants,
  onClose,
  onSelect,
}: {
  open: boolean;
  activeTenantId: string;
  tenants: Tenant[];
  onClose: () => void;
  onSelect: (tenantId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setStatusFilter("all");
      window.setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [open]);

  const byId = useMemo(() => new Map(tenants.map((t) => [t.id, t])), [tenants]);

  const matchingAll = useMemo(() => {
    return tenants.filter(
      (t) => tenantMatchesStatus(t, statusFilter) && tenantMatchesSearch(t, search),
    );
  }, [tenants, statusFilter, search]);

  const recentSection = useMemo(() => {
    const orderedIds = readRecentOrganizations().map((e) => e.id);
    const seen = new Set<string>();
    const recent: Tenant[] = [];
    for (const id of orderedIds) {
      const t = byId.get(id);
      if (!t || seen.has(id)) {
        continue;
      }
      if (tenantMatchesStatus(t, statusFilter) && tenantMatchesSearch(t, search)) {
        seen.add(id);
        recent.push(t);
      }
      if (recent.length >= 8) {
        break;
      }
    }
    return recent;
  }, [byId, statusFilter, search, open]);

  const recentIdSet = useMemo(() => new Set(recentSection.map((t) => t.id)), [recentSection]);

  const restList = useMemo(() => {
    return matchingAll
      .filter((t) => !recentIdSet.has(t.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [matchingAll, recentIdSet]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  function choose(id: string) {
    if (id && id !== activeTenantId) {
      onSelect(id);
    }
    onClose();
  }

  return (
    <div
      className="modal-backdrop org-switcher-backdrop"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="presentation"
    >
      <div
        className="modal org-switcher-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="org-switcher-title"
      >
        <h2 className="modal-title" id="org-switcher-title">
          Switch organization
        </h2>
        <p className="org-switcher-lead muted">
          Search and filter up to hundreds of tenants. Recent picks appear first for quick return.
        </p>

        <div className="org-switcher-toolbar">
          <input
            ref={searchRef}
            autoComplete="off"
            className="field-input org-switcher-search"
            placeholder="Search by name, slug, city, or state…"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search organizations"
          />
          <div className="org-switcher-filters" role="group" aria-label="Filter by status">
            {(
              [
                ["all", "All"],
                ["active", "Active"],
                ["inactive", "Inactive"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={`org-switcher-chip${statusFilter === value ? " org-switcher-chip--active" : ""}`}
                type="button"
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="org-switcher-body">
          {recentSection.length > 0 ? (
            <section className="org-switcher-section" aria-label="Recent organizations">
              <div className="org-switcher-section-title">Recent</div>
              <ul className="org-switcher-list">
                {recentSection.map((t) => (
                  <li key={`recent-${t.id}`}>
                    <OrganizationRow
                      active={t.id === activeTenantId}
                      tenant={t}
                      onChoose={() => choose(t.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="org-switcher-section" aria-label="All matching organizations">
            {recentSection.length > 0 && restList.length > 0 ? (
              <div className="org-switcher-section-title">All matching</div>
            ) : null}
            {!recentSection.length && restList.length > 0 ? (
              <div className="org-switcher-section-title">Organizations</div>
            ) : null}
            {restList.length === 0 && recentSection.length === 0 ? (
              <p className="muted org-switcher-empty">No organizations match your search and filters.</p>
            ) : null}
            {restList.length > 0 ? (
              <ul className="org-switcher-list org-switcher-list--scroll">
                {restList.map((t) => (
                  <li key={t.id}>
                    <OrganizationRow
                      active={t.id === activeTenantId}
                      tenant={t}
                      onChoose={() => choose(t.id)}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>

        <div className="modal-footer org-switcher-footer">
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function OrganizationRow({
  tenant,
  active,
  onChoose,
}: {
  tenant: Tenant;
  active: boolean;
  onChoose: () => void;
}) {
  const secondary = [tenant.slug, tenant.address_city].filter(Boolean).join(" · ");
  return (
    <button
      className={`org-switcher-row${active ? " org-switcher-row--active" : ""}`}
      type="button"
      onClick={onChoose}
    >
      <div className="org-switcher-row-main">
        <div className="org-switcher-row-name">{tenant.name}</div>
        {secondary ? <div className="org-switcher-row-meta text-sm text-secondary">{secondary}</div> : null}
      </div>
      <span className={statusBadgeClass(tenant.status)}>
        <span className="badge-dot" aria-hidden />
        {statusLabel(tenant.status)}
      </span>
    </button>
  );
}
