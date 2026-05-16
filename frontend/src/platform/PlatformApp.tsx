import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import type { MeResponse, SurveyTemplate } from "../types/admin";
import type { PublicBranding } from "../types/publicFeedback";

import { TemplateLibrarySection } from "../components/admin/TemplateLibrarySection";
import { AuditTrailDrawer } from "../components/AuditTrailDrawer";
import {
  clearPlatformTokens,
  createPlatformSuperAdmin,
  createPlatformTenant,
  deletePlatformSurveyTemplate,
  exportPlatformSurveyTemplatePack,
  getPlatformApiBase,
  getStoredPlatformAccessToken,
  importPlatformSurveyTemplatePack,
  listPlatformSuperAdmins,
  listPlatformSurveyTemplates,
  listPlatformTenants,
  patchPlatformSuperAdminUser,
  patchPlatformTenant,
  platformFetchMe,
  PLATFORM_SUPER_ADMIN_DEFAULT_PASSWORD,
  TENANT_ADMIN_DEFAULT_PASSWORD,
  type PlatformTenant,
  type SuperAdminUser,
} from "../lib/platformApi";

import { INDIAN_CITIES, INDIAN_STATES } from "../data/indianRegions";
import {
  PLATFORM_SIDEBAR_STORAGE_KEY,
  usePersistedSidebarCollapsed,
} from "../hooks/usePersistedSidebarCollapsed";

import { PlatformLoginPage } from "./PlatformLoginPage";

type PlatformSection = "users" | "tenants" | "templates";

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function tenantAddressLines(t: PlatformTenant): string[] {
  const lines: string[] = [];
  const l1 = t.address_line1?.trim();
  const l2 = t.address_line2?.trim();
  if (l1) {
    lines.push(l1);
  }
  if (l2) {
    lines.push(l2);
  }
  const city = t.address_city?.trim();
  const st = t.address_state?.trim();
  const pin = t.address_postal_code?.trim();
  const locality = [city, st, pin].filter((x) => (x ?? "").length > 0).join(", ");
  if (locality) {
    lines.push(locality);
  }
  return lines;
}

export function PlatformApp() {
  const [sessionVersion, setSessionVersion] = useState(0);
  const token = getStoredPlatformAccessToken();
  const refreshSession = useCallback(() => {
    setSessionVersion((v) => v + 1);
  }, []);

  if (!token) {
    return <PlatformLoginPage key={sessionVersion} onSignedIn={refreshSession} />;
  }

  return <PlatformShell key={sessionVersion} onSignedOut={refreshSession} />;
}

function PlatformShell({ onSignedOut }: { onSignedOut: () => void }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [section, setSection] = useState<PlatformSection>("tenants");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditTrailOpen, setAuditTrailOpen] = useState(false);
  const { collapsed: sidebarCollapsed, toggle: toggleSidebarCollapsed } = usePersistedSidebarCollapsed(
    PLATFORM_SIDEBAR_STORAGE_KEY,
  );

  const token = getStoredPlatformAccessToken();

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!token) {
        onSignedOut();
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const next = await platformFetchMe(token);
        if (!mounted) {
          return;
        }
        setMe(next);
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e.message : "Unable to load session.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [token, onSignedOut]);

  function signOut() {
    clearPlatformTokens();
    onSignedOut();
  }

  return (
    <div className="app-shell app-shell--platform">
      <aside
        className={`sidebar sidebar--platform${sidebarCollapsed ? " sidebar--collapsed" : ""}`}
        aria-label="Platform application"
      >
        <div className="sidebar-logo">
          <div className="sidebar-logo-brand">
            <div className="logo-dot logo-dot--platform">G</div>
            <span className="logo-text">Platform</span>
          </div>
          <button
            type="button"
            className="sidebar-collapse-toggle"
            onClick={() => toggleSidebarCollapsed()}
            aria-expanded={!sidebarCollapsed}
            aria-controls="platform-sidebar-nav"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span className="material-symbols-outlined" aria-hidden>
              {sidebarCollapsed ? "chevron_right" : "chevron_left"}
            </span>
          </button>
        </div>
        <nav className="sidebar-nav" id="platform-sidebar-nav" aria-label="Platform navigation">
          <div className="nav-section-label">Manage</div>
          <button
            className={`nav-item${section === "tenants" ? " active" : ""}`}
            onClick={() => setSection("tenants")}
            type="button"
            title={sidebarCollapsed ? "Tenants" : undefined}
          >
            <span className="material-symbols-outlined" aria-hidden>
              domain
            </span>
            <span className="nav-item-label">Tenants</span>
          </button>
          <button
            className={`nav-item${section === "templates" ? " active" : ""}`}
            onClick={() => setSection("templates")}
            type="button"
            title={sidebarCollapsed ? "Templates" : undefined}
          >
            <span className="material-symbols-outlined" aria-hidden>
              view_quilt
            </span>
            <span className="nav-item-label">Templates</span>
          </button>
          <div className="nav-section-label">Settings</div>
          <button
            className={`nav-item${section === "users" ? " active" : ""}`}
            onClick={() => setSection("users")}
            type="button"
            title={sidebarCollapsed ? "Users" : undefined}
          >
            <span className="material-symbols-outlined" aria-hidden>
              manage_accounts
            </span>
            <span className="nav-item-label">Users</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user muted">{me?.email ?? "…"}</div>
          <button
            className={`btn btn--ghost${sidebarCollapsed ? " btn--icon" : " btn--sm"}`}
            onClick={signOut}
            type="button"
            title={sidebarCollapsed ? "Sign out" : undefined}
          >
            {sidebarCollapsed ? (
              <span className="material-symbols-outlined" aria-hidden>
                logout
              </span>
            ) : (
              "Sign out"
            )}
          </button>
        </div>
      </aside>
      <main className="main-panel">
        <header className="main-header">
          <div className="main-header__lead">
            <h1 className="main-title">
              {section === "tenants"
                ? "Tenants"
                : section === "users"
                  ? "Users"
                  : "Templates"}
            </h1>
            <p className="main-subtitle muted">
              {section === "tenants"
                ? "Create organizations and designate a tenant administrator."
                : section === "users"
                  ? "Super administrators for this platform console. Deactivated users cannot sign in here or to tenant dashboards with this account."
                  : "Browse the global survey template catalog and preview how each layout renders with sample questions."}
            </p>
          </div>
          {me?.permission_codes.includes("audit:read") &&
          me.role_codes.includes("platform_super_admin") &&
          token ? (
            <div className="topbar-actions main-header__actions">
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                aria-label="Open audit trail for this page"
                title="Audit trail"
                onClick={() => setAuditTrailOpen(true)}
              >
                <span className="material-symbols-outlined">history</span>
              </button>
            </div>
          ) : null}
        </header>
        {loading ? <p className="muted">Loading…</p> : null}
        {!loading && error ? <div className="field-error-msg">{error}</div> : null}
        {!loading && !error && section === "users" ? (
          <PlatformUsersPanel token={token!} currentUserId={me?.user_id ?? null} />
        ) : null}
        {!loading && !error && section === "tenants" ? <PlatformTenantsPanel token={token!} /> : null}
        {!loading && !error && section === "templates" ? <PlatformTemplatesPanel token={token!} /> : null}
      </main>
      {me?.permission_codes.includes("audit:read") &&
      me.role_codes.includes("platform_super_admin") &&
      token ? (
        <AuditTrailDrawer
          open={auditTrailOpen}
          onClose={() => setAuditTrailOpen(false)}
          variant="platform"
          token={token}
          platformPage={section === "templates" ? "templates" : section === "users" ? "users" : "tenants"}
        />
      ) : null}
    </div>
  );
}

const PLATFORM_TEMPLATE_PREVIEW_BRANDING: PublicBranding = {
  logo_url: null,
  primary_color: "#1a73e8",
  secondary_color: "#e8f0fe",
  thank_you_text: "Thank you for your feedback!",
};

function PlatformTemplatesPanel({ token }: { token: string }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importHint, setImportHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  async function refresh() {
    setLoadError(null);
    setBusy(true);
    try {
      setTemplates(await listPlatformSurveyTemplates(token));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Unable to load templates.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [token]);

  async function exportPack(t: SurveyTemplate) {
    setImportHint(null);
    try {
      const blob = await exportPlatformSurveyTemplatePack(token, t.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `template-${t.slug}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setImportHint(e instanceof Error ? e.message : "Export failed.");
    }
  }

  async function onImportPick(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      return;
    }
    setImportHint(null);
    try {
      await importPlatformSurveyTemplatePack(token, file);
      setImportHint(`Imported “${file.name}”. Refresh the list if you don’t see it.`);
      await refresh();
    } catch (e) {
      setImportHint(e instanceof Error ? e.message : "Import failed.");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function deleteSelected(t: SurveyTemplate) {
    setImportHint(null);
    try {
      await deletePlatformSurveyTemplate(token, t.id);
      setImportHint("Template deleted.");
      await refresh();
    } catch (e) {
      setImportHint(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  if (busy) {
    return <p className="muted">Loading templates…</p>;
  }
  if (loadError) {
    return <div className="field-error-msg">{loadError}</div>;
  }

  const toolbar = (
    <div className="platform-templates-toolbar">
      <button type="button" className="btn btn--secondary" onClick={() => fileInputRef.current?.click()}>
        Import template ZIP
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(event) => void onImportPick(event.target.files)}
      />
      {importHint ? (
        <span
          className={
            importHint.startsWith("Imported") || importHint.startsWith("Template deleted")
              ? "muted"
              : "field-error-msg"
          }
          role="status"
        >
          {importHint}
        </span>
      ) : null}
    </div>
  );

  if (templates.length === 0) {
    return (
      <div className="section-stack templates-view">
        {toolbar}
        <div className="empty-state">
          <h3 className="empty-state-title">No templates in the catalog</h3>
          <p className="empty-state-body">
            Import a template package (ZIP) or provision templates via migrations. Packages include{" "}
            <code className="inline-code">template.json</code> and an optional <code className="inline-code">assets/</code>{" "}
            folder for CSS and images—see <code className="inline-code">README.txt</code> inside exports.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="section-stack templates-view">
      {toolbar}
      <TemplateLibrarySection
        brandingPreview={PLATFORM_TEMPLATE_PREVIEW_BRANDING}
        templateAssetsApiOrigin={getPlatformApiBase()}
        templates={templates}
        onDeleteTemplate={deleteSelected}
        onExportTemplate={exportPack}
      />
    </div>
  );
}

function PlatformUsersPanel({
  token,
  currentUserId,
}: {
  token: string;
  currentUserId: string | null;
}) {
  const [users, setUsers] = useState<SuperAdminUser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [patchingId, setPatchingId] = useState<string | null>(null);

  async function refresh() {
    setLoadError(null);
    try {
      setUsers(await listPlatformSuperAdmins(token));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Unable to load.");
    }
  }

  useEffect(() => {
    void refresh();
  }, [token]);

  function closeModal() {
    setAddOpen(false);
    setFirstName("");
    setLastName("");
    setEmail("");
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setLoadError(null);
    try {
      await createPlatformSuperAdmin(token, {
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      closeModal();
      await refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Unable to create.");
    } finally {
      setSaving(false);
    }
  }

  async function setUserStatus(userId: string, status: "active" | "disabled") {
    setPatchingId(userId);
    setLoadError(null);
    try {
      await patchPlatformSuperAdminUser(token, userId, { status });
      await refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Unable to update user.");
    } finally {
      setPatchingId(null);
    }
  }

  return (
    <div className="section-stack">
      {addOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => (saving ? undefined : closeModal())}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !saving) {
              closeModal();
            }
          }}
          role="presentation"
        >
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="platform-add-user-title">
            <h2 className="modal-title" id="platform-add-user-title">
              Add super administrator
            </h2>
            <form onSubmit={onCreate}>
              <div className="modal-body">
                <p className="muted" style={{ margin: 0 }}>
                  New users receive role <strong>Super Administrator</strong>. Initial password is always{" "}
                  <code className="inline-code">{PLATFORM_SUPER_ADMIN_DEFAULT_PASSWORD}</code> (they should change it after first sign-in).
                </p>
                <div className="field">
                  <label className="field-label" htmlFor="pu-first">
                    First name
                  </label>
                  <input
                    className="field-input"
                    id="pu-first"
                    onChange={(e) => setFirstName(e.target.value)}
                    value={firstName}
                    autoComplete="given-name"
                    required
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="pu-last">
                    Last name
                  </label>
                  <input
                    className="field-input"
                    id="pu-last"
                    onChange={(e) => setLastName(e.target.value)}
                    value={lastName}
                    autoComplete="family-name"
                    required
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="pu-email">
                    Email address
                  </label>
                  <input
                    className="field-input"
                    id="pu-email"
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    value={email}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>
              <div className="modal-footer modal-footer--spread">
                <button className="btn btn--ghost" disabled={saving} onClick={() => closeModal()} type="button">
                  Cancel
                </button>
                <button className="btn btn--primary" disabled={saving} type="submit">
                  {saving ? "Creating…" : "Create user"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {loadError ? <div className="field-error-msg">{loadError}</div> : null}
      <section className="chart-card">
        <div className="platform-card-head">
          <div>
            <h2 className="card-overline">Super administrators</h2>
            <p className="muted small-gap" style={{ marginBottom: 0 }}>
              Directory of accounts that can access this console.
            </p>
          </div>
          <button className="btn btn--primary" onClick={() => setAddOpen(true)} type="button">
            Add user
          </button>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>First name</th>
                <th>Last name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = currentUserId !== null && u.id === currentUserId;
                const isActive = u.status === "active";
                const busy = patchingId === u.id;
                return (
                  <tr key={u.id}>
                    <td>{u.first_name}</td>
                    <td>{u.last_name}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className="badge badge--neutral">
                        <span className="badge-dot" aria-hidden />
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${isActive ? "badge--success" : "badge--neutral"}`}>
                        <span className="badge-dot" aria-hidden />
                        {u.status}
                      </span>
                    </td>
                    <td className="table-actions">
                      {isActive ? (
                        <button
                          className="btn btn--ghost btn--sm"
                          disabled={busy || isSelf}
                          onClick={() => void setUserStatus(u.id, "disabled")}
                          title={isSelf ? "You cannot deactivate your own account." : "Deactivate user"}
                          type="button"
                        >
                          {busy ? "…" : "Deactivate"}
                        </button>
                      ) : (
                        <button
                          className="btn btn--ghost btn--sm"
                          disabled={busy}
                          onClick={() => void setUserStatus(u.id, "active")}
                          type="button"
                        >
                          {busy ? "…" : "Reactivate"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No platform users yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PlatformTenantsPanel({ token }: { token: string }) {
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [patchingId, setPatchingId] = useState<string | null>(null);

  const [tenantName, setTenantName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressPin, setAddressPin] = useState("");

  const [adminFirst, setAdminFirst] = useState("");
  const [adminLast, setAdminLast] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  const [editTenant, setEditTenant] = useState<PlatformTenant | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editLocale, setEditLocale] = useState("");
  const [editLine1, setEditLine1] = useState("");
  const [editLine2, setEditLine2] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editAddrState, setEditAddrState] = useState("");
  const [editPin, setEditPin] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  async function refresh() {
    setLoadError(null);
    try {
      setTenants(await listPlatformTenants(token));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Unable to load.");
    }
  }

  useEffect(() => {
    void refresh();
  }, [token]);

  function closeCreateModal() {
    setCreateOpen(false);
    setWizardStep(1);
    setTenantName("");
    setAddressLine1("");
    setAddressLine2("");
    setAddressCity("");
    setAddressState("");
    setAddressPin("");
    setAdminFirst("");
    setAdminLast("");
    setAdminEmail("");
  }

  function goNext(event: FormEvent) {
    event.preventDefault();
    setLoadError(null);
    setWizardStep(2);
  }

  async function onCreateTenant(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setLoadError(null);
    try {
      await createPlatformTenant(token, {
        name: tenantName.trim(),
        default_locale: "en",
        address_line1: addressLine1.trim() || undefined,
        address_line2: addressLine2.trim() || undefined,
        address_city: addressCity.trim(),
        address_state: addressState.trim(),
        address_postal_code: addressPin.trim(),
        tenant_admin_first_name: adminFirst.trim(),
        tenant_admin_last_name: adminLast.trim(),
        tenant_admin_email: adminEmail.trim(),
      });
      closeCreateModal();
      await refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Unable to create tenant.");
    } finally {
      setSaving(false);
    }
  }

  async function setTenantStatus(tenantId: string, status: "active" | "suspended") {
    setPatchingId(tenantId);
    setLoadError(null);
    try {
      await patchPlatformTenant(token, tenantId, { status });
      await refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Unable to update tenant.");
    } finally {
      setPatchingId(null);
    }
  }

  function openEditTenant(t: PlatformTenant) {
    setEditTenant(t);
    setEditName(t.name);
    setEditSlug(t.slug);
    setEditLocale(t.default_locale);
    setEditLine1(t.address_line1 ?? "");
    setEditLine2(t.address_line2 ?? "");
    setEditCity(t.address_city ?? "");
    setEditAddrState(t.address_state ?? "");
    setEditPin(t.address_postal_code ?? "");
    setLoadError(null);
  }

  function closeEditTenant() {
    setEditTenant(null);
    setEditSaving(false);
  }

  async function onSaveTenant(event: FormEvent) {
    event.preventDefault();
    if (!editTenant) {
      return;
    }
    setEditSaving(true);
    setLoadError(null);
    try {
      await patchPlatformTenant(token, editTenant.id, {
        name: editName.trim(),
        slug: editSlug.trim().toLowerCase(),
        default_locale: editLocale.trim(),
        address_line1: editLine1.trim(),
        address_line2: editLine2.trim(),
        address_city: editCity.trim(),
        address_state: editAddrState.trim(),
        address_postal_code: editPin.trim(),
      });
      closeEditTenant();
      await refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Unable to save tenant.");
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="section-stack">
      {createOpen ? (
        <div
          className="modal-backdrop"
          onClick={() => (saving ? undefined : closeCreateModal())}
          role="presentation"
        >
          <div
            className="modal modal--platform-tenant"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="platform-create-tenant-title"
          >
            <h2 className="modal-title" id="platform-create-tenant-title">
              Create tenant
            </h2>
            <div className="wizard-steps" aria-label="Steps">
              <div className={`wizard-step${wizardStep === 1 ? " wizard-step--active" : ""}`}>
                <span>1</span> Tenant details
              </div>
              <div className={`wizard-step${wizardStep === 2 ? " wizard-step--active" : ""}`}>
                <span>2</span> Administrator
              </div>
            </div>
            {wizardStep === 1 ? (
              <form onSubmit={goNext}>
                <div className="modal-body">
                  <p className="muted" style={{ margin: 0 }}>
                    A URL slug is generated from the organization name. Default locale is English (en).
                  </p>
                  <div className="field">
                    <label className="field-label" htmlFor="pt-name">
                      Tenant / organization name
                    </label>
                    <input
                      className="field-input"
                      id="pt-name"
                      onChange={(e) => setTenantName(e.target.value)}
                      value={tenantName}
                      required
                    />
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="pt-addr1">
                      Address line 1 <span className="muted">(optional)</span>
                    </label>
                    <input
                      className="field-input"
                      id="pt-addr1"
                      onChange={(e) => setAddressLine1(e.target.value)}
                      value={addressLine1}
                      autoComplete="address-line1"
                    />
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="pt-addr2">
                      Address line 2 <span className="muted">(optional)</span>
                    </label>
                    <input
                      className="field-input"
                      id="pt-addr2"
                      onChange={(e) => setAddressLine2(e.target.value)}
                      value={addressLine2}
                      autoComplete="address-line2"
                    />
                  </div>
                  <div className="field-row field-row--tight">
                    <div className="field">
                      <label className="field-label" htmlFor="pt-city">
                        City
                      </label>
                      <input
                        className="field-input"
                        id="pt-city"
                        list="platform-create-indian-cities"
                        onChange={(e) => setAddressCity(e.target.value)}
                        placeholder="Search city"
                        value={addressCity}
                        autoComplete="address-level2"
                        required
                      />
                    </div>
                    <div className="field">
                      <label className="field-label" htmlFor="pt-state">
                        State / region
                      </label>
                      <input
                        className="field-input"
                        id="pt-state"
                        list="platform-create-indian-states"
                        onChange={(e) => setAddressState(e.target.value)}
                        placeholder="Search state or union territory"
                        value={addressState}
                        autoComplete="address-level1"
                        required
                      />
                    </div>
                  </div>
                  <datalist id="platform-create-indian-cities">
                    {INDIAN_CITIES.map((cityName) => (
                      <option key={cityName} value={cityName} />
                    ))}
                  </datalist>
                  <datalist id="platform-create-indian-states">
                    {INDIAN_STATES.map((stateName) => (
                      <option key={stateName} value={stateName} />
                    ))}
                  </datalist>
                  <div className="field">
                    <label className="field-label" htmlFor="pt-pin">
                      PIN / postal code
                    </label>
                    <input
                      className="field-input"
                      id="pt-pin"
                      onChange={(e) => setAddressPin(e.target.value)}
                      value={addressPin}
                      autoComplete="postal-code"
                      required
                    />
                  </div>
                </div>
                <div className="modal-footer modal-footer--spread">
                  <button className="btn btn--ghost" onClick={() => closeCreateModal()} type="button">
                    Cancel
                  </button>
                  <button className="btn btn--primary" type="submit">
                    Next
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={(e) => void onCreateTenant(e)}>
                <div className="modal-body">
                  <p className="muted" style={{ margin: 0 }}>
                    The first user is assigned the tenant <strong>Administrator</strong> role (full
                    access). Initial password is{" "}
                    <code className="inline-code">{TENANT_ADMIN_DEFAULT_PASSWORD}</code> until they
                    change it.
                  </p>
                  <div className="field">
                    <label className="field-label" htmlFor="pt-a-first">
                      First name
                    </label>
                    <input
                      className="field-input"
                      id="pt-a-first"
                      onChange={(e) => setAdminFirst(e.target.value)}
                      value={adminFirst}
                      autoComplete="given-name"
                      required
                    />
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="pt-a-last">
                      Last name
                    </label>
                    <input
                      className="field-input"
                      id="pt-a-last"
                      onChange={(e) => setAdminLast(e.target.value)}
                      value={adminLast}
                      autoComplete="family-name"
                      required
                    />
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="pt-a-email">
                      Email address
                    </label>
                    <input
                      className="field-input"
                      id="pt-a-email"
                      onChange={(e) => setAdminEmail(e.target.value)}
                      type="email"
                      value={adminEmail}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>
                <div className="modal-footer modal-footer--spread">
                  <button
                    className="btn btn--ghost"
                    disabled={saving}
                    onClick={() => setWizardStep(1)}
                    type="button"
                  >
                    Back
                  </button>
                  <button className="btn btn--primary" disabled={saving} type="submit">
                    {saving ? "Creating…" : "Create tenant"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
      {editTenant ? (
        <div
          className="modal-backdrop"
          onClick={() => (editSaving ? undefined : closeEditTenant())}
          role="presentation"
        >
          <div
            className="modal modal--platform-tenant"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="platform-edit-tenant-title"
          >
            <h2 className="modal-title" id="platform-edit-tenant-title">
              Edit tenant · {editTenant.name}
            </h2>
            <form onSubmit={(e) => void onSaveTenant(e)}>
              <div className="modal-body">
                <p className="muted" style={{ margin: 0 }}>
                  Changing the slug updates URLs that include it; ensure tenants know before renaming.
                </p>
                <div className="field">
                  <label className="field-label" htmlFor="pe-name">
                    Tenant / organization name
                  </label>
                  <input
                    className="field-input"
                    id="pe-name"
                    onChange={(e) => setEditName(e.target.value)}
                    value={editName}
                    required
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="pe-slug">
                    URL slug
                  </label>
                  <input
                    className="field-input"
                    id="pe-slug"
                    onChange={(e) => setEditSlug(e.target.value)}
                    value={editSlug}
                    autoComplete="off"
                    spellCheck={false}
                    pattern="[a-z0-9][a-z0-9-]{1,78}[a-z0-9]"
                    title="Lowercase letters, digits, hyphens; 3–80 characters."
                    required
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="pe-locale">
                    Default locale
                  </label>
                  <input
                    className="field-input"
                    id="pe-locale"
                    onChange={(e) => setEditLocale(e.target.value)}
                    value={editLocale}
                    autoComplete="off"
                    minLength={2}
                    maxLength={16}
                    required
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="pe-addr1">
                    Address line 1 <span className="muted">(optional)</span>
                  </label>
                  <input
                    className="field-input"
                    id="pe-addr1"
                    onChange={(e) => setEditLine1(e.target.value)}
                    value={editLine1}
                    autoComplete="address-line1"
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="pe-addr2">
                    Address line 2 <span className="muted">(optional)</span>
                  </label>
                  <input
                    className="field-input"
                    id="pe-addr2"
                    onChange={(e) => setEditLine2(e.target.value)}
                    value={editLine2}
                    autoComplete="address-line2"
                  />
                </div>
                <div className="field-row field-row--tight">
                  <div className="field">
                    <label className="field-label" htmlFor="pe-city">
                      City
                    </label>
                    <input
                      className="field-input"
                      id="pe-city"
                      list="platform-edit-indian-cities"
                      onChange={(e) => setEditCity(e.target.value)}
                      placeholder="Search city"
                      value={editCity}
                      autoComplete="address-level2"
                      required
                    />
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="pe-state">
                      State / region
                    </label>
                    <input
                      className="field-input"
                      id="pe-state"
                      list="platform-edit-indian-states"
                      onChange={(e) => setEditAddrState(e.target.value)}
                      placeholder="Search state or union territory"
                      value={editAddrState}
                      autoComplete="address-level1"
                      required
                    />
                  </div>
                </div>
                <datalist id="platform-edit-indian-cities">
                  {INDIAN_CITIES.map((cityName) => (
                    <option key={cityName} value={cityName} />
                  ))}
                </datalist>
                <datalist id="platform-edit-indian-states">
                  {INDIAN_STATES.map((stateName) => (
                    <option key={stateName} value={stateName} />
                  ))}
                </datalist>
                <div className="field">
                  <label className="field-label" htmlFor="pe-pin">
                    PIN / postal code
                  </label>
                  <input
                    className="field-input"
                    id="pe-pin"
                    onChange={(e) => setEditPin(e.target.value)}
                    value={editPin}
                    autoComplete="postal-code"
                    required
                  />
                </div>
              </div>
              <div className="modal-footer modal-footer--spread">
                <button
                  className="btn btn--ghost"
                  disabled={editSaving}
                  onClick={() => closeEditTenant()}
                  type="button"
                >
                  Cancel
                </button>
                <button className="btn btn--primary" disabled={editSaving} type="submit">
                  {editSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {loadError ? <div className="field-error-msg">{loadError}</div> : null}
      <section className="chart-card">
        <div className="platform-card-head">
          <div>
            <h2 className="card-overline">All tenants</h2>
            <p className="muted small-gap" style={{ marginBottom: 0 }}>
              Organizations on the platform. Deactivated tenants cannot sign in to the tenant admin app.
            </p>
          </div>
          <button className="btn btn--primary" onClick={() => setCreateOpen(true)} type="button">
            Create tenant
          </button>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>Invited administrator</th>
                <th>Slug</th>
                <th>Locale</th>
                <th>Status</th>
                <th>Created</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const isActive = t.status === "active";
                const busy = patchingId === t.id;
                const addrLines = tenantAddressLines(t);
                const invitedName = t.administrator_display_name?.trim();
                const invitedEmail = t.administrator_email?.trim();
                return (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>
                      {addrLines.length > 0 ? (
                        <div className="platform-tenant-address-cell">
                          {addrLines.map((line, i) => (
                            <div key={`${t.id}-addr-${i}`}>{line}</div>
                          ))}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {invitedEmail || invitedName ? (
                        <>
                          {invitedName ? <div className="fw-medium">{invitedName}</div> : null}
                          {(invitedEmail ?? "").length > 0 ? (
                            <div className={invitedName ? "text-sm text-secondary" : "fw-medium"}>
                              {invitedEmail ?? ""}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <code className="inline-code">{t.slug}</code>
                    </td>
                    <td>{t.default_locale}</td>
                    <td>
                      <span className={`badge ${isActive ? "badge--success" : "badge--warning"}`}>
                        <span className="badge-dot" aria-hidden />
                        {t.status}
                      </span>
                    </td>
                    <td>{formatTs(t.created_at)}</td>
                    <td className="table-actions table-actions--inline-icons">
                      <div className="platform-tenant-actions">
                        <button
                          className="btn btn--ghost btn--icon platform-tenant-row-icon"
                          disabled={busy || editSaving}
                          onClick={() => openEditTenant(t)}
                          type="button"
                          aria-label={`Edit tenant ${t.name}`}
                          title="Edit tenant"
                        >
                          <span className="material-symbols-outlined" aria-hidden>
                            edit
                          </span>
                        </button>
                        {isActive ? (
                          <button
                            className="btn btn--ghost btn--icon platform-tenant-row-icon platform-tenant-row-icon--danger"
                            disabled={busy}
                            onClick={() => void setTenantStatus(t.id, "suspended")}
                            type="button"
                            aria-label={`Deactivate tenant ${t.name}`}
                            title="Deactivate tenant"
                          >
                            <span className="material-symbols-outlined" aria-hidden>
                              domain_disabled
                            </span>
                          </button>
                        ) : (
                          <button
                            className="btn btn--ghost btn--icon platform-tenant-row-icon"
                            disabled={busy}
                            onClick={() => void setTenantStatus(t.id, "active")}
                            type="button"
                            aria-label={`Reactivate tenant ${t.name}`}
                            title="Reactivate tenant"
                          >
                            <span className="material-symbols-outlined" aria-hidden>
                              domain
                            </span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {tenants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    No tenants yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
