import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import type { MeResponse } from "../types/admin";
import {
  clearPlatformTokens,
  createPlatformSuperAdmin,
  createPlatformTenant,
  getStoredPlatformAccessToken,
  listPlatformSuperAdmins,
  listPlatformTenants,
  platformFetchMe,
  TENANT_ADMIN_DEFAULT_PASSWORD,
  type PlatformTenant,
  type SuperAdminUser,
} from "../lib/platformApi";

import { PlatformLoginPage } from "./PlatformLoginPage";

type PlatformSection = "admins" | "tenants";

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
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

  const token = useMemo(() => getStoredPlatformAccessToken(), []);

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
      <aside className="sidebar sidebar--platform">
        <div className="sidebar-logo">
          <div className="logo-dot logo-dot--platform">G</div>
          <span className="logo-text">Platform</span>
        </div>
        <nav className="sidebar-nav" aria-label="Platform navigation">
          <div className="nav-section-label">Console</div>
          <button
            className={`nav-item${section === "admins" ? " active" : ""}`}
            onClick={() => setSection("admins")}
            type="button"
          >
            <span className="material-symbols-outlined" aria-hidden>
              shield_person
            </span>
            Super admin users
          </button>
          <button
            className={`nav-item${section === "tenants" ? " active" : ""}`}
            onClick={() => setSection("tenants")}
            type="button"
          >
            <span className="material-symbols-outlined" aria-hidden>
              domain
            </span>
            Tenants
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user muted">{me?.email ?? "…"}</div>
          <button className="btn btn--ghost btn--sm" onClick={signOut} type="button">
            Sign out
          </button>
        </div>
      </aside>
      <main className="main-panel">
        <header className="main-header">
          <h1 className="main-title">{section === "tenants" ? "Tenants" : "Super admin users"}</h1>
          <p className="main-subtitle muted">
            {section === "tenants"
              ? "Create organizations and designate a tenant administrator."
              : "People who can sign in here and in the tenant console with full access."}
          </p>
        </header>
        {loading ? <p className="muted">Loading…</p> : null}
        {!loading && error ? <div className="field-error-msg">{error}</div> : null}
        {!loading && !error && section === "admins" ? <PlatformAdminsPanel token={token!} /> : null}
        {!loading && !error && section === "tenants" ? <PlatformTenantsPanel token={token!} /> : null}
      </main>
    </div>
  );
}

function PlatformAdminsPanel({ token }: { token: string }) {
  const [users, setUsers] = useState<SuperAdminUser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

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

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setLoadError(null);
    try {
      await createPlatformSuperAdmin(token, {
        email: email.trim(),
        display_name: displayName.trim(),
        password,
      });
      setEmail("");
      setDisplayName("");
      setPassword("");
      await refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Unable to create.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="section-stack">
      <section className="chart-card">
        <h2 className="card-overline">Add platform super admin</h2>
        <p className="muted small-gap">
          New accounts can sign in on this console and automatically have full tenant-admin access everywhere.
        </p>
        <form className="platform-inline-form" onSubmit={onCreate}>
          <div className="field">
            <label className="field-label" htmlFor="sa-email">
              Email
            </label>
            <input
              className="field-input"
              id="sa-email"
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              value={email}
              required
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="sa-name">
              Display name
            </label>
            <input
              className="field-input"
              id="sa-name"
              onChange={(e) => setDisplayName(e.target.value)}
              value={displayName}
              required
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="sa-pass">
              Password
            </label>
            <input
              className="field-input"
              id="sa-pass"
              minLength={8}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              value={password}
              required
            />
          </div>
          <button className="btn btn--primary" disabled={saving} type="submit">
            {saving ? "Creating…" : "Create"}
          </button>
        </form>
      </section>
      {loadError ? <div className="field-error-msg">{loadError}</div> : null}
      <section className="chart-card">
        <h2 className="card-overline">Directory</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.display_name}</td>
                  <td>{u.status}</td>
                  <td>{formatTs(u.created_at)}</td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
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
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [locale, setLocale] = useState("en");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminDisplay, setAdminDisplay] = useState("");
  const [saving, setSaving] = useState(false);

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

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setLoadError(null);
    try {
      await createPlatformTenant(token, {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        default_locale: locale.trim(),
        tenant_admin_email: adminEmail.trim(),
        tenant_admin_display_name: adminDisplay.trim() || null,
      });
      setName("");
      setSlug("");
      setAdminEmail("");
      setAdminDisplay("");
      await refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Unable to create tenant.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="section-stack">
      <section className="chart-card">
        <h2 className="card-overline">Onboard tenant</h2>
        <p className="muted small-gap">
          The tenant administrator receives password <code className="inline-code">{TENANT_ADMIN_DEFAULT_PASSWORD}</code>{" "}
          until they change it in the tenant console.
        </p>
        <form className="platform-inline-form platform-inline-form--grid" onSubmit={onCreate}>
          <div className="field">
            <label className="field-label" htmlFor="t-name">
              Organization name
            </label>
            <input
              className="field-input"
              id="t-name"
              onChange={(e) => setName(e.target.value)}
              value={name}
              required
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="t-slug">
              Slug
            </label>
            <input
              className="field-input"
              id="t-slug"
              onChange={(e) => setSlug(e.target.value)}
              pattern="^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$"
              title="Lowercase letters, numbers, hyphens; 3–80 chars."
              value={slug}
              required
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="t-locale">
              Default locale
            </label>
            <input
              className="field-input"
              id="t-locale"
              onChange={(e) => setLocale(e.target.value)}
              value={locale}
              minLength={2}
              maxLength={16}
              required
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="t-admin-email">
              Tenant admin email
            </label>
            <input
              className="field-input"
              id="t-admin-email"
              onChange={(e) => setAdminEmail(e.target.value)}
              type="email"
              value={adminEmail}
              required
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="t-admin-name">
              Tenant admin display name (optional)
            </label>
            <input
              className="field-input"
              id="t-admin-name"
              onChange={(e) => setAdminDisplay(e.target.value)}
              value={adminDisplay}
            />
          </div>
          <div className="platform-form-actions">
            <button className="btn btn--primary" disabled={saving} type="submit">
              {saving ? "Creating…" : "Create tenant"}
            </button>
          </div>
        </form>
      </section>
      {loadError ? <div className="field-error-msg">{loadError}</div> : null}
      <section className="chart-card">
        <h2 className="card-overline">All tenants</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Locale</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.slug}</td>
                  <td>{t.default_locale}</td>
                  <td>{t.status}</td>
                  <td>{formatTs(t.created_at)}</td>
                </tr>
              ))}
              {tenants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
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
