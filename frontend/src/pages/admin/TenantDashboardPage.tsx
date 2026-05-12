import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ReactNode } from "react";

import {
  addSurveyQuestion,
  clearStoredTokens,
  copyChannel,
  copySurvey,
  createChannel,
  createLocation,
  createRole,
  createSurvey,
  createTenantUser,
  fetchSurveyDetail,
  fetchMe,
  fetchTenantDashboard,
  fetchTenantList,
  getStoredAccessToken,
  importTenantBrandingLogoFromUrl,
  ACTIVE_TENANT_STORAGE_KEY,
  patchTenantProfile,
  publishSurvey,
  updateTenantBranding,
  uploadTenantBrandingLogoFile,
  updateLocation,
  updateChannel,
  updateTenantUser,
  updateRole,
  updateSurvey,
  updateSurveyQuestion,
  patchSurveyQuestion,
} from "../../lib/adminApi";
import type {
  Channel,
  DashboardData,
  Location,
  MeResponse,
  Permission,
  QuestionType,
  Role,
  Survey,
  SurveyDetail,
  SurveyQuestion,
  SurveyTemplate,
  SurveyVersion,
  Tenant,
  TenantBranding,
  TenantUser,
} from "../../types/admin";
import { FeedbackFlow } from "../../components/feedback/FeedbackFlow";
import { mapSurveyQuestionToPublic } from "../../components/feedback/mapSurveyQuestionToPublic";
import { ChannelQrPosterModal } from "../../components/ChannelQrPosterModal";
import { PortalOverflowMenu } from "../../components/PortalOverflowMenu";
import {
  TEMPLATE_GALLERY_FIXTURE_QUESTIONS,
  buildPreviewContextStub,
} from "../../components/feedback/templateGalleryFixtures";
import { DEFAULT_SURVEY_PRESENTATION, normalizeSurveyPresentation, type SurveyPresentation } from "../../types/surveyPresentation";
import type { PublicBranding, PublicOrganization } from "../../types/publicFeedback";
import { mapTenantProfileToPublicOrganization } from "../../types/publicFeedback";
import { ResponsesExplorer } from "./ResponsesExplorer";

type PageState = "loading" | "ready" | "error";
type ActiveAdminView =
  | "dashboard"
  | "locations"
  | "surveys"
  | "channels"
  | "responses"
  | "analytics"
  | "organization"
  | "templates"
  | "users"
  | "roles";
type CreateModalType = "location" | "survey" | "channel" | "user";

const VIEW_CONFIG: Record<ActiveAdminView, { title: string; action: string | null }> = {
  dashboard: { title: "Dashboard", action: null },
  locations: { title: "Locations", action: "Add Location" },
  surveys: { title: "Surveys", action: "Create Survey" },
  channels: { title: "Channels", action: "Create Channel" },
  responses: { title: "Responses", action: null },
  analytics: { title: "Analytics", action: "Export CSV" },
  organization: { title: "Organization", action: null },
  templates: { title: "Templates", action: null },
  users: { title: "Users", action: "Add User" },
  roles: { title: "Roles", action: null },
};

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

const INDIAN_CITIES = [
  "Ahmedabad",
  "Amritsar",
  "Bengaluru",
  "Bhopal",
  "Bhubaneswar",
  "Chandigarh",
  "Chennai",
  "Coimbatore",
  "Delhi",
  "Faridabad",
  "Ghaziabad",
  "Gurugram",
  "Guwahati",
  "Hyderabad",
  "Indore",
  "Jaipur",
  "Kochi",
  "Kolkata",
  "Lucknow",
  "Ludhiana",
  "Madurai",
  "Mangaluru",
  "Mumbai",
  "Mysuru",
  "Nagpur",
  "Nashik",
  "Noida",
  "Patna",
  "Pune",
  "Raipur",
  "Rajkot",
  "Ranchi",
  "Surat",
  "Thiruvananthapuram",
  "Vadodara",
  "Varanasi",
  "Vijayawada",
  "Visakhapatnam",
];

const ROLE_FILTER_ALL = "__ALL__";

function humanizeRoleCode(code: string): string {
  return code
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function formatRoleCodesForDisplay(me: MeResponse | null | undefined, roles: Role[]): string {
  const codes = me?.role_codes ?? [];
  if (codes.length === 0) {
    return "Member";
  }
  const byCode = new Map(roles.map((r) => [r.code, r.name]));
  return codes.map((code) => byCode.get(code) ?? humanizeRoleCode(code)).join(", ");
}

function SidebarAccountMenu({
  activeTenantId,
  email,
  onSignOut,
  onTenantChange,
  roleLine,
  tenantOptions,
}: {
  activeTenantId: string | null;
  email: string | undefined;
  onSignOut: () => void;
  onTenantChange: (tenantId: string) => void;
  roleLine: string;
  tenantOptions: Tenant[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const node = wrapRef.current;
      if (node && !node.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      window.addEventListener("keydown", handleEscape);
      return () => window.removeEventListener("keydown", handleEscape);
    }
  }, [menuOpen]);

  return (
    <div className="sidebar-account-wrap" ref={wrapRef}>
      <button
        aria-expanded={menuOpen}
        aria-haspopup="true"
        className="user-row"
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <div className="avatar">{userInitials(email)}</div>
        <div className="user-info">
          <div className="user-name">{email ?? "Signed in"}</div>
          <div className="user-role">{roleLine}</div>
        </div>
        <span className="material-symbols-outlined user-menu-icon" aria-hidden>
          {menuOpen ? "expand_less" : "expand_more"}
        </span>
      </button>
      {menuOpen ? (
        <div className="account-menu" role="menu">
          {tenantOptions.length > 0 && activeTenantId ? (
            <div className="account-menu-section" onClick={(e) => e.stopPropagation()}>
              <div className="account-menu-label">Organization</div>
              <select
                aria-label="Active organization"
                className="account-menu-tenant-select"
                value={activeTenantId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  if (nextId && nextId !== activeTenantId) {
                    window.sessionStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, nextId);
                    onTenantChange(nextId);
                  }
                  setMenuOpen(false);
                }}
              >
                {tenantOptions.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.slug})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {tenantOptions.length > 0 && activeTenantId ? <div className="account-menu-divider" /> : null}
          <button
            className="account-menu-item account-menu-item--danger"
            role="menuitem"
            type="button"
            onClick={() => {
              setMenuOpen(false);
              onSignOut();
            }}
          >
            <span className="material-symbols-outlined" aria-hidden>
              logout
            </span>
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TenantDashboardPage({ onSignedOut }: { onSignedOut: () => void }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [tenantPickerOptions, setTenantPickerOptions] = useState<Tenant[]>([]);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveAdminView>("dashboard");
  const [activeCreateModal, setActiveCreateModal] = useState<CreateModalType | null>(null);
  const [isCreatingSurvey, setIsCreatingSurvey] = useState(false);
  const [activeSurveyBuilderId, setActiveSurveyBuilderId] = useState<string | null>(null);

  async function loadDashboard(
    overrideTenantId?: string | null,
    options?: { openSurveyBuilderAfter?: string | null },
  ) {
    const token = getStoredAccessToken();
    if (!token) {
      onSignedOut();
      return;
    }

    setPageState("loading");
    setError(null);
    setIsCreatingSurvey(false);
    setActiveSurveyBuilderId(null);
    setActiveCreateModal(null);

    const nextMe = await fetchMe(token);
    let tenantId: string;

    if (nextMe.tenant_id) {
      setTenantPickerOptions([]);
      tenantId = nextMe.tenant_id;
    } else {
      const list = await fetchTenantList(token);
      setTenantPickerOptions(list);

      if (list.length === 0) {
        throw new Error(
          "No tenants found. Tenants are created by the platform provisioning service.",
        );
      }

      let chosen =
        overrideTenantId && list.some((t) => t.id === overrideTenantId)
          ? overrideTenantId
          : undefined;

      if (!chosen) {
        const stored = window.sessionStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
        chosen =
          stored && list.some((t) => t.id === stored) ? stored : (list[0]?.id ?? undefined);
      }

      if (!chosen) {
        throw new Error("Could not choose a tenant context.");
      }

      window.sessionStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, chosen);
      tenantId = chosen;
    }

    const nextDashboardData = await fetchTenantDashboard(
      token,
      tenantId,
      nextMe.permission_codes,
    );
    setMe(nextMe);
    setDashboardData(nextDashboardData);
    setPageState("ready");

    const openBuilder = options?.openSurveyBuilderAfter;
    if (openBuilder) {
      setActiveSurveyBuilderId(openBuilder);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialDashboard() {
      try {
        await loadDashboard();
        if (!isMounted) {
          return;
        }
      } catch (nextError) {
        if (isMounted) {
          setError(nextError instanceof Error ? nextError.message : "Unable to load dashboard.");
          setPageState("error");
        }
      }
    }

    loadInitialDashboard();
    return () => {
      isMounted = false;
    };
  }, [onSignedOut]);

  function signOut() {
    clearStoredTokens();
    onSignedOut();
  }

  const activeViewConfig = VIEW_CONFIG[activeView];
  const createModalType = createModalTypeForView(activeView);
  const can = (permissionCode: string) => me?.permission_codes.includes(permissionCode) ?? false;
  const canAccessSettings = can("branding:read") || can("user:read") || can("role:read");
  const canListTemplates = can("survey:read") || can("channel:read");
  const showSettingsNavGroup = canAccessSettings || canListTemplates;
  const canUseActiveAction =
    (activeView === "locations" && can("location:create")) ||
    (activeView === "surveys" && can("survey:create")) ||
    (activeView === "channels" && can("channel:create")) ||
    (activeView === "users" && can("user:create")) ||
    (activeView === "analytics" && can("analytics:read"));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-dot">G</div>
          <span className="logo-text">goliSoda</span>
        </div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          <div className="nav-section-label">Overview</div>
          <AdminNavItem
            activeView={activeView}
            icon="dashboard"
            label="Dashboard"
            onSelect={setActiveView}
            view="dashboard"
          />
          <div className="nav-section-label">Manage</div>
          {can("location:read") ? (
            <AdminNavItem
              activeView={activeView}
              icon="location_on"
              label="Locations"
              onSelect={setActiveView}
              view="locations"
            />
          ) : null}
          {can("survey:read") ? (
            <AdminNavItem
              activeView={activeView}
              icon="assignment"
              label="Surveys"
              onSelect={setActiveView}
              view="surveys"
            />
          ) : null}
          {can("channel:read") ? (
            <AdminNavItem
              activeView={activeView}
              icon="qr_code_2"
              label="Channel"
              onSelect={setActiveView}
              view="channels"
            />
          ) : null}
          {can("response:read") ? (
            <AdminNavItem
              activeView={activeView}
              icon="inbox"
              label="Response"
              onSelect={setActiveView}
              view="responses"
            />
          ) : null}
          {can("analytics:read") ? (
            <>
              <div className="nav-section-label">Analytics</div>
              <AdminNavItem
                activeView={activeView}
                icon="bar_chart"
                label="Analytics"
                onSelect={setActiveView}
                view="analytics"
              />
            </>
          ) : null}
          {showSettingsNavGroup ? <div className="nav-section-label">Settings</div> : null}
          {can("branding:read") ? (
            <AdminNavItem
              activeView={activeView}
              icon="business"
              label="Organization"
              onSelect={setActiveView}
              view="organization"
            />
          ) : null}
          {canListTemplates ? (
            <AdminNavItem
              activeView={activeView}
              icon="style"
              label="Templates"
              onSelect={setActiveView}
              view="templates"
            />
          ) : null}
          {can("user:read") ? (
            <AdminNavItem
              activeView={activeView}
              icon="group"
              label="Users"
              onSelect={setActiveView}
              view="users"
            />
          ) : null}
          {can("role:read") ? (
            <AdminNavItem
              activeView={activeView}
              icon="admin_panel_settings"
              label="Roles"
              onSelect={setActiveView}
              view="roles"
            />
          ) : null}
        </nav>
        <div className="sidebar-footer">
          <SidebarAccountMenu
            activeTenantId={dashboardData?.tenant.id ?? null}
            email={me?.email}
            onSignOut={signOut}
            onTenantChange={(nextId) => {
              void loadDashboard(nextId);
            }}
            roleLine={formatRoleCodesForDisplay(me, dashboardData?.roles ?? [])}
            tenantOptions={tenantPickerOptions}
          />
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <h1 className="topbar-title">{activeViewConfig.title}</h1>
          <div className="topbar-actions">
            <button className="btn btn--ghost btn--icon" type="button" aria-label="Notifications">
              <span className="material-symbols-outlined">notifications_none</span>
            </button>
            <button className="btn btn--ghost btn--icon" type="button" aria-label="Help">
              <span className="material-symbols-outlined">help_outline</span>
            </button>
            {activeViewConfig.action && canUseActiveAction ? (
              <button
                className="btn btn--primary"
                type="button"
                onClick={() => {
                  if (activeView === "surveys") {
                    setIsCreatingSurvey(true);
                    setActiveSurveyBuilderId(null);
                    return;
                  }
                  if (createModalType) {
                    setActiveCreateModal(createModalType);
                  }
                }}
              >
                <span className="material-symbols-outlined">
                  {activeView === "analytics" ? "download" : "add"}
                </span>
                {activeViewConfig.action}
              </button>
            ) : null}
          </div>
        </header>
        <main
          className={activeSurveyBuilderId ? "page-content page-content--survey-builder" : "page-content"}
        >
          {pageState === "loading" ? <DashboardLoading /> : null}
          {pageState === "error" ? <DashboardError message={error} /> : null}
          {pageState === "ready" && dashboardData && isCreatingSurvey ? (
            <CreateSurveyModal
              onClose={() => setIsCreatingSurvey(false)}
              onSaved={async () => {
                await loadDashboard();
              }}
              onSavedAndContinue={async (surveyId) => {
                await loadDashboard(undefined, { openSurveyBuilderAfter: surveyId });
              }}
              tenantId={dashboardData.tenant.id}
            />
          ) : null}
          {pageState === "ready" && dashboardData && activeSurveyBuilderId ? (
            <SurveyBuilderModal
              onClose={() => setActiveSurveyBuilderId(null)}
              onUpdated={loadDashboard}
              surveyId={activeSurveyBuilderId}
              surveyTemplates={dashboardData.surveyTemplates}
              surveyVersions={dashboardData.surveyVersions}
              tenantBranding={dashboardData.branding}
              tenantId={dashboardData.tenant.id}
              organization={mapTenantProfileToPublicOrganization(dashboardData.tenant)}
            />
          ) : null}
          {pageState === "ready" && dashboardData && !isCreatingSurvey && !activeSurveyBuilderId ? (
            <AdminView
              activeView={activeView}
              dashboardData={dashboardData}
              me={me}
              onOpenSurveyBuilder={setActiveSurveyBuilderId}
              onUpdated={loadDashboard}
            />
          ) : null}
        </main>
      </div>
      {activeCreateModal && dashboardData ? (
        <CreateResourceModal
          dashboardData={dashboardData}
          modalType={activeCreateModal}
          onClose={() => setActiveCreateModal(null)}
          onCreated={async () => {
            if (activeCreateModal !== "survey") {
              setActiveCreateModal(null);
            }
            await loadDashboard();
          }}
          onSurveySavedAndContinue={async (surveyId) => {
            await loadDashboard(undefined, { openSurveyBuilderAfter: surveyId });
          }}
          tenantId={dashboardData.tenant.id}
        />
      ) : null}
    </div>
  );
}

function AdminNavItem({
  activeView,
  icon,
  label,
  onSelect,
  view,
}: {
  activeView: ActiveAdminView;
  icon: string;
  label: string;
  onSelect: (view: ActiveAdminView) => void;
  view: ActiveAdminView;
}) {
  return (
    <button
      className={`nav-item ${activeView === view ? "active" : ""}`}
      type="button"
      onClick={() => onSelect(view)}
    >
      <span className="material-symbols-outlined">{icon}</span>
      {label}
    </button>
  );
}

function createModalTypeForView(activeView: ActiveAdminView): CreateModalType | null {
  if (activeView === "locations") {
    return "location";
  }
  if (activeView === "surveys") {
    return "survey";
  }
  if (activeView === "channels") {
    return "channel";
  }
  if (activeView === "users") {
    return "user";
  }
  return null;
}

function hasClientPermission(me: MeResponse | null | undefined, permissionCode: string): boolean {
  return me?.permission_codes.includes(permissionCode) ?? false;
}

function AdminView({
  activeView,
  dashboardData,
  me,
  onOpenSurveyBuilder,
  onUpdated,
}: {
  activeView: ActiveAdminView;
  dashboardData: DashboardData;
  me: MeResponse | null;
  onOpenSurveyBuilder: (surveyId: string) => void;
  onUpdated: () => Promise<void>;
}) {
  if (activeView === "locations") {
    return (
      <LocationsView
        locations={dashboardData.locations}
        me={me}
        onUpdated={onUpdated}
        tenantId={dashboardData.tenant.id}
      />
    );
  }
  if (activeView === "surveys") {
    return (
      <SurveysView
        onOpenSurveyBuilder={onOpenSurveyBuilder}
        onUpdated={onUpdated}
        me={me}
        surveys={dashboardData.surveys}
        surveyVersions={dashboardData.surveyVersions}
        tenantId={dashboardData.tenant.id}
      />
    );
  }
  if (activeView === "channels") {
    return (
      <ChannelsView
        dashboardData={dashboardData}
        me={me}
        onUpdated={onUpdated}
        tenantId={dashboardData.tenant.id}
      />
    );
  }
  if (activeView === "users") {
    return (
      <UsersView
        locations={dashboardData.locations}
        me={me}
        onUpdated={onUpdated}
        roles={dashboardData.roles}
        tenantId={dashboardData.tenant.id}
        users={dashboardData.users}
      />
    );
  }
  if (activeView === "responses") {
    return <ResponsesExplorer channels={dashboardData.channels} tenantId={dashboardData.tenant.id} />;
  }
  if (activeView === "analytics") {
    return <AnalyticsView dashboardData={dashboardData} />;
  }
  if (activeView === "organization") {
    return <OrganizationView dashboardData={dashboardData} me={me} onUpdated={onUpdated} />;
  }
  if (activeView === "templates") {
    return <TemplatesView dashboardData={dashboardData} />;
  }
  if (activeView === "roles") {
    return (
      <RolesView
        dashboardData={dashboardData}
        me={me}
        onUpdated={onUpdated}
        tenantId={dashboardData.tenant.id}
        users={dashboardData.users}
      />
    );
  }
  return (
    <DashboardContent
      dashboardData={dashboardData}
      me={me}
      onOpenSurveyBuilder={onOpenSurveyBuilder}
      onUpdated={onUpdated}
    />
  );
}

function CreateResourceModal({
  dashboardData,
  modalType,
  onClose,
  onCreated,
  onSurveySavedAndContinue,
  tenantId,
}: {
  dashboardData: DashboardData;
  modalType: CreateModalType;
  onClose: () => void;
  onCreated: () => Promise<void>;
  onSurveySavedAndContinue: (surveyId: string) => Promise<void>;
  tenantId: string;
}) {
  if (modalType === "location") {
    return <CreateLocationModal onClose={onClose} onCreated={onCreated} tenantId={tenantId} />;
  }
  if (modalType === "survey") {
    return (
      <CreateSurveyModal
        onClose={onClose}
        onSaved={onCreated}
        onSavedAndContinue={onSurveySavedAndContinue}
        tenantId={tenantId}
      />
    );
  }
  if (modalType === "user") {
    return (
      <CreateUserModal
        locations={dashboardData.locations}
        onClose={onClose}
        onCreated={onCreated}
        roles={dashboardData.roles}
        tenantId={tenantId}
      />
    );
  }
  return (
    <CreateChannelModal
      dashboardData={dashboardData}
      onClose={onClose}
      onCreated={onCreated}
      tenantId={tenantId}
    />
  );
}

function CreateLocationModal({
  location,
  onClose,
  onCreated,
  tenantId,
}: {
  location?: Location;
  onClose: () => void;
  onCreated: () => Promise<void>;
  tenantId: string;
}) {
  const [name, setName] = useState(location?.name ?? "");
  const [code, setCode] = useState(location?.code ?? "");
  const [address, setAddress] = useState(location?.address ?? "");
  const [city, setCity] = useState(location?.city ?? "");
  const [region, setRegion] = useState(location?.region ?? "");
  const [isCodeEdited, setIsCodeEdited] = useState(Boolean(location));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateName(nextName: string) {
    setName(nextName);
    if (!isCodeEdited) {
      setCode(generateLocationCode(nextName));
    }
  }

  async function submit() {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    if (!name.trim() || !code.trim()) {
      setError("Location name and code are required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim(),
        address: address.trim() || null,
        city: city.trim() || null,
        region: region.trim() || null,
      };
      if (location) {
        await updateLocation(token, tenantId, location.id, payload);
      } else {
        await createLocation(token, tenantId, {
          ...payload,
          address: payload.address ?? undefined,
          city: payload.city ?? undefined,
          region: payload.region ?? undefined,
        });
      }
      await onCreated();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create location.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell
      error={error}
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={location ? "Save Location" : "Create Location"}
      title={location ? "Edit Location" : "Add Location"}
    >
      <div className="field">
        <label className="field-label" htmlFor="location-name">
          Location Name
        </label>
        <input
          className="field-input"
          id="location-name"
          onChange={(event) => updateName(event.target.value)}
          placeholder="e.g. Brigade Road"
          value={name}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="location-code">
          Location Code
        </label>
        <input
          className="field-input"
          id="location-code"
          onChange={(event) => {
            setIsCodeEdited(true);
            setCode(event.target.value.toUpperCase());
          }}
          placeholder="Auto-generated"
          value={code}
        />
        <span className="field-hint">
          Generated from the location name plus a random 4-digit suffix. You can edit it.
        </span>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="location-address">
          Address
        </label>
        <textarea
          className="field-input modal-textarea"
          id="location-address"
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Street address, building, landmark"
          value={address}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label className="field-label" htmlFor="location-city">
            City
          </label>
          <input
            className="field-input"
            list="indian-cities"
            id="location-city"
            onChange={(event) => setCity(event.target.value)}
            placeholder="Search city"
            value={city}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="location-region">
            State / Region
          </label>
          <input
            className="field-input"
            list="indian-states"
            id="location-region"
            onChange={(event) => setRegion(event.target.value)}
            placeholder="Search state or union territory"
            value={region}
          />
        </div>
      </div>
      <datalist id="indian-cities">
        {INDIAN_CITIES.map((cityName) => (
          <option key={cityName} value={cityName} />
        ))}
      </datalist>
      <datalist id="indian-states">
        {INDIAN_STATES.map((stateName) => (
          <option key={stateName} value={stateName} />
        ))}
      </datalist>
    </ModalShell>
  );
}

function CreateSurveyModal({
  onClose,
  onSaved,
  onSavedAndContinue,
  tenantId,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  onSavedAndContinue: (surveyId: string) => Promise<void>;
  tenantId: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(goToQuestions: boolean) {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    if (!title.trim()) {
      setError("Survey name is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const survey = await createSurvey(token, tenantId, {
        title: title.trim(),
        slug: generateUniqueSurveySlug(title),
        description: description.trim() || undefined,
        default_locale: "en",
      });
      if (goToQuestions) {
        await onSavedAndContinue(survey.id);
      } else {
        await onSaved();
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create survey.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell
      error={error}
      footer={
        <footer className="modal-footer modal-footer--spread">
          <button className="btn btn--ghost" disabled={isSubmitting} type="button" onClick={onClose}>
            Cancel
          </button>
          <div className="modal-footer-actions">
            <button
              className="btn btn--secondary"
              disabled={isSubmitting}
              type="button"
              onClick={() => submit(false)}
            >
              {isSubmitting ? "Saving" : "Save"}
            </button>
            <button
              className="btn btn--primary"
              disabled={isSubmitting}
              type="button"
              onClick={() => submit(true)}
            >
              {isSubmitting ? "Saving" : "Save and Add Questions"}
            </button>
          </div>
        </footer>
      }
      onClose={onClose}
      title="Create Survey"
    >
      <p className="modal-lead">Add a name and description. You can add questions next if you choose.</p>
      <div className="field">
        <label className="field-label" htmlFor="survey-title">
          Survey name
        </label>
        <input
          className="field-input"
          id="survey-title"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Post-visit NPS"
          value={title}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="survey-description">
          Description
        </label>
        <textarea
          className="field-input modal-textarea"
          id="survey-description"
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Optional context for your team"
          value={description}
        />
      </div>
    </ModalShell>
  );
}

function CreateChannelModal({
  channel,
  dashboardData,
  onClose,
  onCreated,
  tenantId,
}: {
  channel?: Channel;
  dashboardData: DashboardData;
  onClose: () => void;
  onCreated: () => Promise<void>;
  tenantId: string;
}) {
  const defaultSurveyTemplateId = useMemo(() => {
    return (
      dashboardData.surveyTemplates.find((template) => template.slug === "default_stepper")?.id ??
      dashboardData.surveyTemplates[0]?.id ??
      ""
    );
  }, [dashboardData.surveyTemplates]);

  const [name, setName] = useState(channel?.name ?? "");
  const [locationId, setLocationId] = useState(channel?.location_id ?? dashboardData.locations[0]?.id ?? "");
  const [surveyVersionId, setSurveyVersionId] = useState(
    channel?.survey_version_id ?? dashboardData.surveyVersions[0]?.id ?? "",
  );
  const [surveyTemplateId, setSurveyTemplateId] = useState(
    channel?.survey_template_id ?? defaultSurveyTemplateId,
  );
  const [channelType, setChannelType] = useState<"qr" | "kiosk">(channel?.channel_type ?? "qr");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setName(channel?.name ?? "");
    setLocationId(channel?.location_id ?? dashboardData.locations[0]?.id ?? "");
    setSurveyVersionId(channel?.survey_version_id ?? dashboardData.surveyVersions[0]?.id ?? "");
    setSurveyTemplateId(channel?.survey_template_id ?? defaultSurveyTemplateId);
    setChannelType(channel?.channel_type ?? "qr");
  }, [channel, dashboardData.locations, dashboardData.surveyVersions, defaultSurveyTemplateId]);

  async function submit() {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    if (!name.trim() || !locationId || !surveyVersionId || !surveyTemplateId) {
      setError("Channel name, location, published survey version, and template are required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        location_id: locationId,
        survey_version_id: surveyVersionId,
        survey_template_id: surveyTemplateId,
        channel_type: channelType,
      };
      if (channel) {
        await updateChannel(token, tenantId, channel.id, payload);
      } else {
        await createChannel(token, tenantId, payload);
      }
      await onCreated();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create channel.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell
      error={error}
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={channel ? "Save Channel" : "Create Channel"}
      title={channel ? "Edit Channel" : "Create Channel"}
    >
      <div className="field">
        <label className="field-label" htmlFor="channel-name">
          Channel Name
        </label>
        <input
          className="field-input"
          id="channel-name"
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Entrance QR"
          value={name}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="channel-location">
          Location
        </label>
        <select
          className="field-input"
          id="channel-location"
          onChange={(event) => setLocationId(event.target.value)}
          value={locationId}
        >
          {dashboardData.locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="channel-survey-version">
          Published Survey Version
        </label>
        <select
          className="field-input"
          id="channel-survey-version"
          onChange={(event) => setSurveyVersionId(event.target.value)}
          value={surveyVersionId}
        >
          {dashboardData.surveyVersions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.schema_snapshot.survey?.title ?? "Published survey"} v{version.version_number}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="channel-survey-template">
          Presentation template
        </label>
        <select
          className="field-input"
          id="channel-survey-template"
          onChange={(event) => setSurveyTemplateId(event.target.value)}
          value={surveyTemplateId}
        >
          {dashboardData.surveyTemplates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <span className="field-hint">Controls layout and visuals on the public feedback page.</span>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="channel-type">
          Channel Type
        </label>
        <select
          className="field-input"
          id="channel-type"
          onChange={(event) => setChannelType(event.target.value as "qr" | "kiosk")}
          value={channelType}
        >
          <option value="qr">QR</option>
          <option value="kiosk">Kiosk</option>
        </select>
      </div>
    </ModalShell>
  );
}

function CreateUserModal({
  user,
  locations,
  onClose,
  onCreated,
  roles,
  tenantId,
}: {
  user?: TenantUser;
  locations: Location[];
  onClose: () => void;
  onCreated: () => Promise<void>;
  roles: Role[];
  tenantId: string;
}) {
  const primaryRole = user?.role_bindings[0];
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [roleCode, setRoleCode] = useState(primaryRole?.role_code ?? roles[0]?.code ?? "analyst");
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>(
    user?.role_bindings
      .map((binding) => binding.location_id)
      .filter((locationId): locationId is string => Boolean(locationId)) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleLocation(locationId: string) {
    setSelectedLocationIds((currentIds) =>
      currentIds.includes(locationId)
        ? currentIds.filter((currentId) => currentId !== locationId)
        : [...currentIds, locationId],
    );
  }

  async function submit() {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    if (!displayName.trim() || !email.trim() || (!user && password.length < 8)) {
      setError(
        user
          ? "Name and email are required."
          : "Name, email, and an 8+ character password are required.",
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const savedUser = user
        ? await updateTenantUser(token, tenantId, user.id, {
            display_name: displayName.trim(),
            email: email.trim(),
            role_code: roleCode,
            location_ids: selectedLocationIds,
          })
        : await createTenantUser(token, tenantId, {
            display_name: displayName.trim(),
            email: email.trim(),
            password,
          });
      if (!user) {
        await updateTenantUser(token, tenantId, savedUser.id, {
          role_code: roleCode,
          location_ids: selectedLocationIds,
        });
      }
      await onCreated();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not save user.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell
      error={error}
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={user ? "Save User" : "Add User"}
      title={user ? "Edit User" : "Add User"}
    >
      <div className="field">
        <label className="field-label" htmlFor="user-name">
          Name
        </label>
        <input
          className="field-input"
          id="user-name"
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="e.g. Priya Sharma"
          value={displayName}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="user-email">
          Email
        </label>
        <input
          className="field-input"
          id="user-email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          type="email"
          value={email}
        />
      </div>
      {user ? null : (
        <div className="field">
          <label className="field-label" htmlFor="user-password">
            Temporary Password
          </label>
          <input
            className="field-input"
            id="user-password"
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
          <span className="field-hint">Share this securely and ask the user to change it later.</span>
        </div>
      )}
      <div className="field-row">
        <div className="field">
          <label className="field-label" htmlFor="user-role">
            Role
          </label>
          <select
            className="field-input"
            id="user-role"
            onChange={(event) => setRoleCode(event.target.value)}
            value={roleCode}
          >
            {roles.map((role) => (
              <option key={role.id} value={role.code}>
                {role.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label className="field-label">Location Scope</label>
        <div className="checkbox-list">
          {locations.map((location) => (
            <label className="checkbox-row" key={location.id}>
              <input
                checked={selectedLocationIds.includes(location.id)}
                onChange={() => toggleLocation(location.id)}
                type="checkbox"
              />
              <span>{location.name}</span>
            </label>
          ))}
        </div>
        <span className="field-hint">
          Leave all unchecked for all locations. Select one or more to restrict scope.
        </span>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  children,
  error,
  footer,
  isSubmitting,
  onClose,
  onSubmit,
  submitLabel,
  title,
}: {
  children: ReactNode;
  error: string | null;
  footer?: ReactNode;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  title: string;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">{title}</h2>
        <div className="modal-body">{children}</div>
        {error ? <div className="field-error-msg">{error}</div> : null}
        {footer ?? (
          <footer className="modal-footer">
            <button className="btn btn--ghost" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn--primary"
              disabled={isSubmitting}
              type="button"
              onClick={onSubmit}
            >
              {isSubmitting ? "Saving" : (submitLabel ?? "Save")}
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function generateSurveySlug(title: string): string {
  const nextSlug = slugify(title);
  if (!nextSlug) {
    return "";
  }
  if (nextSlug.length >= 3) {
    return nextSlug;
  }
  return `${nextSlug}-survey`;
}

function generateUniqueSurveySlug(title: string): string {
  const suffix = Math.floor(1000 + Math.random() * 9000);
  const baseSlug = generateSurveySlug(title) || "survey";
  return `${baseSlug}-${suffix}`.slice(0, 120);
}

function generateLocationCode(name: string): string {
  const nameCode = name
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase();
  if (!nameCode) {
    return "";
  }
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${nameCode}-${randomSuffix}`;
}

/** Stable ID for matching answers and analytics; must not change after responses exist. API: ^[a-zA-Z0-9_:-]{1,120}$ */
function generateQuestionKey(): string {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `q_${suffix}`.slice(0, 120);
}

function sortQuestionsForDisplay(questions: SurveyQuestion[]): SurveyQuestion[] {
  return [...questions].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return a.created_at.localeCompare(b.created_at);
  });
}

/** Insert gap before zero-based item index `insertBefore` in [0, items.length] (original ordering). */
function reorderSurveyQuestionsAtInsertion<T>(
  items: readonly T[],
  fromIndex: number,
  insertBefore: number,
): T[] {
  const n = items.length;
  if (
    fromIndex < 0 ||
    fromIndex >= n ||
    insertBefore < 0 ||
    insertBefore > n ||
    n === 0
  ) {
    return [...items];
  }
  const next = [...items];
  const [removed] = next.splice(fromIndex, 1);
  let insertAt = insertBefore;
  if (fromIndex < insertBefore) {
    insertAt -= 1;
  }
  insertAt = Math.max(0, Math.min(insertAt, next.length));
  next.splice(insertAt, 0, removed);
  return next;
}

function insertionIndexFromDragOver(el: HTMLElement, clientY: number, rowIndex: number): number {
  const rect = el.getBoundingClientRect();
  return clientY < rect.top + rect.height / 2 ? rowIndex : rowIndex + 1;
}

const DND_QUESTION_INDEX = "application/x-golisoda-question-index";

function matchesSearchTerm(values: Array<string | null | undefined>, searchTerm: string): boolean {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }
  return values.some((value) => value?.toLowerCase().includes(normalizedSearch));
}

function channelLocationCells(
  dashboardData: DashboardData,
  locationId: string,
): { title: string; subtitle: string | null } {
  const location = dashboardData.locations.find((candidate) => candidate.id === locationId);
  if (!location) {
    return { title: "Unknown location", subtitle: null };
  }
  return {
    title: location.name,
    subtitle: null,
  };
}

function channelSurveyLine(dashboardData: DashboardData, surveyVersionId: string): string {
  const version = dashboardData.surveyVersions.find((candidate) => candidate.id === surveyVersionId);
  if (!version) {
    return "—";
  }
  const survey = dashboardData.surveys.find((candidate) => candidate.id === version.survey_id);
  const title = survey?.title ?? "Survey";
  return `${title} · v${version.version_number}`;
}

function publicFeedbackPathForChannelCode(channelCode: string): string {
  return `/f/${encodeURIComponent(channelCode)}`;
}

function publicFeedbackAbsoluteUrl(channelCode: string): string {
  const path = publicFeedbackPathForChannelCode(channelCode);
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

function templateLabelForChannel(dashboardData: DashboardData, templateId: string): string {
  return (
    dashboardData.surveyTemplates.find((template) => template.id === templateId)?.name ?? "—"
  );
}

function channelSearchValues(dashboardData: DashboardData, channel: Channel): Array<string | null | undefined> {
  const location = dashboardData.locations.find((candidate) => candidate.id === channel.location_id);
  const cells = channelLocationCells(dashboardData, channel.location_id);
  return [
    channel.name,
    channel.channel_code,
    channel.channel_type,
    channel.status,
    cells.title,
    location?.city,
    location?.region,
    location?.code,
    publicFeedbackPathForChannelCode(channel.channel_code),
    channelSurveyLine(dashboardData, channel.survey_version_id),
    templateLabelForChannel(dashboardData, channel.survey_template_id),
  ];
}

function SurveyBuilderModal({
  onClose,
  onUpdated,
  surveyId,
  surveyTemplates,
  surveyVersions,
  tenantBranding,
  tenantId,
  organization,
}: {
  onClose: () => void;
  onUpdated: () => Promise<void>;
  surveyId: string;
  surveyTemplates: SurveyTemplate[];
  surveyVersions: SurveyVersion[];
  tenantBranding: TenantBranding;
  tenantId: string;
  organization: PublicOrganization;
}) {
  const [surveyDetail, setSurveyDetail] = useState<SurveyDetail | null>(null);
  const [builderMode, setBuilderMode] = useState<"editor" | "preview">("editor");
  const [previewTemplateId, setPreviewTemplateId] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionType, setQuestionType] = useState<QuestionType>("nps");
  const [prompt, setPrompt] = useState("");
  const [helpText, setHelpText] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [isPii, setIsPii] = useState(false);
  const [isRequired, setIsRequired] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null);
  const [dropInsertIndex, setDropInsertIndex] = useState<number | null>(null);
  const dragQuestionIndexRef = useRef<number | null>(null);
  const dropInsertIndexRef = useRef<number | null>(null);
  const questionListRef = useRef<HTMLDivElement | null>(null);

  function clearDropIndicator() {
    dropInsertIndexRef.current = null;
    setDropInsertIndex(null);
  }

  async function loadSurveyDetail() {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    const nextDetail = await fetchSurveyDetail(token, tenantId, surveyId);
    setSurveyDetail(nextDetail);
  }

  useEffect(() => {
    loadSurveyDetail().catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : "Could not load survey.");
    });
  }, [surveyId, tenantId]);

  const orderedQuestions = useMemo(
    () => (surveyDetail ? sortQuestionsForDisplay(surveyDetail.questions) : []),
    [surveyDetail],
  );

  useEffect(() => {
    const nextDefault =
      surveyTemplates.find((template) => template.slug === "default_stepper")?.id ??
      surveyTemplates[0]?.id ??
      "";
    setPreviewTemplateId((previous) =>
      previous && surveyTemplates.some((template) => template.id === previous) ? previous : nextDefault,
    );
  }, [surveyTemplates]);

  const previewTemplate =
    surveyTemplates.find((template) => template.id === previewTemplateId) ?? surveyTemplates[0];
  const previewPresentation = normalizeSurveyPresentation(previewTemplate?.presentation ?? {});
  const previewSlug = previewTemplate?.slug ?? "default_stepper";

  const editingQuestion = orderedQuestions.find((question) => question.id === editingQuestionId);
  const latestPublishedVersion = surveyDetail
    ? latestSurveyVersionsBySurveyId(surveyVersions).get(surveyDetail.id)
    : undefined;
  const isPublishedLocked = surveyDetail?.status === "published";

  function resetQuestionForm() {
    setEditingQuestionId(null);
    setQuestionType("nps");
    setPrompt("");
    setHelpText("");
    setOptionsText("");
    setIsPii(false);
    setIsRequired(true);
    setBuilderMode("editor");
  }

  function editQuestion(question: SurveyQuestion) {
    setEditingQuestionId(question.id);
    setQuestionType(question.question_type);
    setPrompt(question.prompt);
    setHelpText(question.help_text ?? "");
    setOptionsText(formatOptionsTextForEditor(question));
    setIsPii(question.is_pii);
    setIsRequired(question.is_required);
    setBuilderMode("editor");
  }

  async function persistQuestionOrderAfterDrag(fromIndex: number, insertBefore: number) {
    if (isPublishedLocked || !surveyDetail) {
      return;
    }
    const ordered = sortQuestionsForDisplay(surveyDetail.questions);
    const reordered = reorderSurveyQuestionsAtInsertion(ordered, fromIndex, insertBefore);
    if (ordered.every((question, ordinal) => question.id === reordered[ordinal]?.id)) {
      clearDropIndicator();
      return;
    }
    const token = getStoredAccessToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      for (let i = 0; i < reordered.length; i++) {
        const q = reordered[i];
        if (q.sort_order !== i) {
          await patchSurveyQuestion(token, tenantId, surveyId, q.id, { sort_order: i });
        }
      }
      await loadSurveyDetail();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not reorder questions.");
    } finally {
      setIsSubmitting(false);
      clearDropIndicator();
    }
  }

  async function saveQuestion() {
    if (isPublishedLocked) {
      setError("Create a new version before editing a published survey.");
      return;
    }

    const token = getStoredAccessToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    if (!prompt.trim()) {
      setError("Question prompt is required.");
      return;
    }

    let options: Array<{ value: string; label: string; sort_order: number }>;
    try {
      options = buildQuestionOptions(questionType, optionsText);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Invalid options.");
      return;
    }
    if (requiresOptions(questionType) && options.length === 0) {
      setError("This question type requires at least one option.");
      return;
    }

    const nextSortOrder =
      orderedQuestions.length === 0 ? 0 : Math.max(...orderedQuestions.map((q) => q.sort_order)) + 1;

    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        question_key: editingQuestion?.question_key ?? generateQuestionKey(),
        question_type: questionType,
        prompt: prompt.trim(),
        help_text: helpText.trim() || undefined,
        is_required: isRequired,
        is_pii: isPii,
        sort_order: editingQuestion?.sort_order ?? nextSortOrder,
        options,
      };
      if (editingQuestionId) {
        await updateSurveyQuestion(token, tenantId, surveyId, editingQuestionId, payload);
      } else {
        await addSurveyQuestion(token, tenantId, surveyId, payload);
      }
      resetQuestionForm();
      await loadSurveyDetail();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not save question.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function publishCurrentSurvey() {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    if (!orderedQuestions.length) {
      setError("Add at least one question before publishing.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await publishSurvey(token, tenantId, surveyId);
      await onUpdated();
      await loadSurveyDetail();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not publish survey.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createNewVersionDraft() {
    const token = getStoredAccessToken();
    if (!token || !surveyDetail) {
      setError("Please sign in again.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await updateSurvey(token, tenantId, surveyDetail.id, { status: "draft" });
      await onUpdated();
      await loadSurveyDetail();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create a new version.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
      <section className="survey-detail-page survey-builder-page">
        <div className="builder-header">
          <div>
            <button className="btn btn--ghost" type="button" onClick={onClose}>
              <span className="material-symbols-outlined">arrow_back</span>
              Surveys
            </button>
            <h2 className="modal-title">{surveyDetail?.title ?? "Survey Builder"}</h2>
            <p className="builder-subtitle">
              Add questions, configure options, then publish an immutable version.
            </p>
            <div className="version-summary">
              <span>
                {surveyDetail
                  ? formatSurveyVersionState(surveyDetail, latestPublishedVersion)
                  : "Draft"}
              </span>
              {surveyDetail?.status === "draft" && latestPublishedVersion ? (
                <span className="version-summary-draft">Draft changes will publish as v{latestPublishedVersion.version_number + 1}</span>
              ) : null}
            </div>
          </div>
          <div className="builder-header-actions">
            {isPublishedLocked ? (
              <button
                className="btn btn--primary"
                disabled={isSubmitting}
                type="button"
                onClick={createNewVersionDraft}
              >
                <span className="material-symbols-outlined">add_circle</span>
                Create New Version
              </button>
            ) : null}
            <button
              className="btn btn--secondary"
              type="button"
              onClick={() => setBuilderMode((currentMode) => (currentMode === "preview" ? "editor" : "preview"))}
            >
              <span className="material-symbols-outlined">
                {builderMode === "preview" ? "edit" : "visibility"}
              </span>
              {builderMode === "preview" ? "Back to Edit" : "Preview Form"}
            </button>
            <StatusBadge
              className={surveyStatusClass(surveyDetail?.status ?? "draft")}
              label={surveyDetail?.status ?? "draft"}
            />
          </div>
        </div>

        <div className="builder-layout">
          <section className="builder-panel">
            <div className="builder-section-header">
              <h3 className="builder-section-title">Questions</h3>
              <button
                className="btn btn--ghost"
                disabled={isPublishedLocked}
                type="button"
                onClick={resetQuestionForm}
              >
                <span className="material-symbols-outlined">add</span>
                Add
              </button>
            </div>
            {orderedQuestions.length ? (
              <div
                ref={questionListRef}
                className={`question-list ${dragSourceIndex !== null ? "question-list--dragging" : ""}`}
                onDragLeave={(event) => {
                  const nextTarget = event.relatedTarget;
                  if (!(nextTarget instanceof Node) || !questionListRef.current?.contains(nextTarget)) {
                    clearDropIndicator();
                  }
                }}
              >
                {orderedQuestions.map((question, index) => (
                  <Fragment key={question.id}>
                    <div
                      aria-hidden="true"
                      className={`question-drop-marker ${dragSourceIndex !== null && dropInsertIndex === index ? "question-drop-marker--active" : ""}`}
                    />
                    <div
                      className={`question-card-wrap question-list-item ${
                        dragSourceIndex === index ? "question-list-item--dragging" : ""
                      }`}
                      onDragOver={(event) => {
                        const fromIdx = dragQuestionIndexRef.current;
                        if (fromIdx === null || isPublishedLocked || isSubmitting) {
                          return;
                        }
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        const nextInsert = insertionIndexFromDragOver(
                          event.currentTarget as HTMLElement,
                          event.clientY,
                          index,
                        );
                        dropInsertIndexRef.current = nextInsert;
                        setDropInsertIndex(nextInsert);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        let fromIndex = dragQuestionIndexRef.current;
                        if (fromIndex === null) {
                          try {
                            const raw = event.dataTransfer.getData(DND_QUESTION_INDEX);
                            fromIndex = parseInt(raw, 10);
                            if (Number.isNaN(fromIndex)) {
                              fromIndex = parseInt(event.dataTransfer.getData("text/plain"), 10);
                            }
                          } catch {
                            /* empty */
                          }
                        }
                        const insertBefore = insertionIndexFromDragOver(
                          event.currentTarget as HTMLElement,
                          event.clientY,
                          index,
                        );
                        dragQuestionIndexRef.current = null;
                        setDragSourceIndex(null);
                        clearDropIndicator();
                        if (fromIndex == null || Number.isNaN(fromIndex) || isPublishedLocked) {
                          return;
                        }
                        persistQuestionOrderAfterDrag(fromIndex, insertBefore).catch(() => {});
                      }}
                    >
                      <div
                        aria-hidden={isPublishedLocked}
                        aria-label={isPublishedLocked ? undefined : `Drag to reorder: ${question.prompt}`}
                        className="question-drag-handle"
                        draggable={!(isPublishedLocked || isSubmitting)}
                        title="Drag to reorder"
                        onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}
                        onDragStart={(dragEvent) => {
                          if (isPublishedLocked || isSubmitting) {
                            dragEvent.preventDefault();
                            return;
                          }
                          dragEvent.stopPropagation();
                          dragEvent.dataTransfer.effectAllowed = "move";
                          dragEvent.dataTransfer.setData(DND_QUESTION_INDEX, String(index));
                          dragEvent.dataTransfer.setData("text/plain", String(index));
                          dragQuestionIndexRef.current = index;
                          setDragSourceIndex(index);
                          clearDropIndicator();
                        }}
                        onDragEnd={() => {
                          dragQuestionIndexRef.current = null;
                          setDragSourceIndex(null);
                          clearDropIndicator();
                        }}
                      >
                        <span className="material-symbols-outlined" aria-hidden>
                          drag_indicator
                        </span>
                      </div>
                      <button
                        className={`question-row ${editingQuestionId === question.id ? "question-row--active" : ""}`}
                        disabled={isPublishedLocked}
                        type="button"
                        onClick={() => editQuestion(question)}
                      >
                        <div className="question-index">{index + 1}</div>
                        <div>
                          <div className="fw-medium">{question.prompt}</div>
                          <div className="text-sm text-secondary">{question.question_type}</div>
                        </div>
                        <span className="material-symbols-outlined question-row-edit">edit</span>
                      </button>
                    </div>
                  </Fragment>
                ))}
                <div
                  aria-hidden="true"
                  className={`question-drop-marker question-drop-marker--after-list ${dragSourceIndex !== null && dropInsertIndex === orderedQuestions.length ? "question-drop-marker--active" : ""}`}
                  onDragOver={(event) => {
                    const fromIdx = dragQuestionIndexRef.current;
                    if (fromIdx === null || isPublishedLocked || isSubmitting) {
                      return;
                    }
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    const n = orderedQuestions.length;
                    dropInsertIndexRef.current = n;
                    setDropInsertIndex(n);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    let fromIndex = dragQuestionIndexRef.current;
                    if (fromIndex === null) {
                      try {
                        const raw = event.dataTransfer.getData(DND_QUESTION_INDEX);
                        fromIndex = parseInt(raw, 10);
                        if (Number.isNaN(fromIndex)) {
                          fromIndex = parseInt(event.dataTransfer.getData("text/plain"), 10);
                        }
                      } catch {
                        /* empty */
                      }
                    }
                    const tailInsert = orderedQuestions.length;
                    dragQuestionIndexRef.current = null;
                    setDragSourceIndex(null);
                    clearDropIndicator();
                    if (fromIndex == null || Number.isNaN(fromIndex) || isPublishedLocked) {
                      return;
                    }
                    persistQuestionOrderAfterDrag(fromIndex, tailInsert).catch(() => {});
                  }}
                />
              </div>
            ) : (
              <EmptyState
                title="No questions yet"
                body="Add the first question to make this survey publishable."
              />
            )}
          </section>

          <section className="builder-panel">
            {builderMode === "preview" ? (
              <>
                <div className="field">
                  <label className="field-label" htmlFor="builder-preview-template">
                    Preview template
                  </label>
                  <select
                    className="field-input"
                    id="builder-preview-template"
                    onChange={(event) => setPreviewTemplateId(event.target.value)}
                    value={previewTemplateId}
                  >
                    {surveyTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  <span className="field-hint">Layouts and control styles mirror the customer form.</span>
                </div>
                <SurveyPreview
                  branding={tenantBranding}
                  presentation={previewPresentation}
                  questions={orderedQuestions}
                  surveyDescription={surveyDetail?.description ?? null}
                  templateSlug={previewSlug}
                  title={surveyDetail?.title ?? "Survey"}
                  organization={organization}
                />
              </>
            ) : (
              <>
                <h3 className="builder-section-title">
                  {editingQuestionId ? "Edit Question" : "Add Question"}
                </h3>
                {isPublishedLocked ? (
                  <div className="version-lock-panel">
                    This survey is currently published. Create a new version before editing questions.
                  </div>
                ) : null}
                <div className="modal-body">
                  <div className="field">
                    <label className="field-label" htmlFor="builder-type">
                      Question Type
                    </label>
                    <select
                      className="field-input"
                      id="builder-type"
                      onChange={(event) => setQuestionType(event.target.value as QuestionType)}
                      value={questionType}
                    >
                      <option value="nps">NPS (0–10)</option>
                      <option value="csat_5">CSAT · 5-point scale</option>
                      <option value="csat_4">CSAT · 4-point scale</option>
                      <option value="csat_2">CSAT · binary (1–2)</option>
                      <option value="single_selection">Single Selection</option>
                      <option value="multi_selection">Multi Selection</option>
                      <option value="plain_text">Plain Text (multi-line)</option>
                      <option value="short_text">Short Text (single line)</option>
                      <option value="phone">Phone</option>
                      <option value="email">Email</option>
                      <option value="dropdown">Dropdown</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="builder-prompt">
                      Prompt
                    </label>
                    <input
                      className="field-input"
                      id="builder-prompt"
                      onChange={(event) => setPrompt(event.target.value)}
                      placeholder="e.g. How was your visit?"
                      value={prompt}
                    />
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor="builder-help">
                      Help Text
                    </label>
                    <input
                      className="field-input"
                      id="builder-help"
                      onChange={(event) => setHelpText(event.target.value)}
                      placeholder="Optional helper text shown below the question"
                      value={helpText}
                    />
                  </div>
                  {requiresOptions(questionType) || allowsOptionalEmojiLabels(questionType) ? (
                    <div className="field">
                      <label className="field-label" htmlFor="builder-options">
                        {allowsOptionalEmojiLabels(questionType) ? "Optional captions" : "Options"}
                      </label>
                      <textarea
                        className="field-input modal-textarea"
                        id="builder-options"
                        onChange={(event) => setOptionsText(event.target.value)}
                        placeholder={
                          allowsOptionalEmojiLabels(questionType)
                            ? optionalEmojiCaptionsPlaceholder(questionType)
                            : "One option per line, e.g.&#10;Food quality&#10;Service&#10;Ambience"
                        }
                        value={optionsText}
                      />
                      {allowsOptionalEmojiLabels(questionType) ? (
                        <span className="field-hint">
                          Leave empty for default labels, or enter exactly {emojiLabelCount(questionType)}{" "}
                          lines to customize the text under each emoji.
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <label className="checkbox-row">
                    <input
                      checked={isRequired}
                      onChange={(event) => setIsRequired(event.target.checked)}
                      type="checkbox"
                    />
                    Required question
                  </label>
                  <label className="checkbox-row">
                    <input checked={isPii} onChange={(event) => setIsPii(event.target.checked)} type="checkbox" />
                    This question collects PII
                  </label>
                </div>
              </>
            )}
          </section>
        </div>

        {error ? <div className="field-error-msg">{error}</div> : null}
        <footer className="modal-footer">
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Close
          </button>
          {builderMode === "editor" ? (
            <>
              {editingQuestionId ? (
                <button className="btn btn--ghost" type="button" onClick={resetQuestionForm}>
                  Cancel Edit
                </button>
              ) : null}
              <button
                className="btn btn--secondary"
                disabled={isSubmitting || isPublishedLocked}
                type="button"
                onClick={saveQuestion}
              >
                {editingQuestionId ? "Save Question" : "Add Question"}
              </button>
            </>
          ) : null}
          <button
            className="btn btn--primary"
            disabled={
              isSubmitting ||
              !orderedQuestions.length ||
              surveyDetail?.status === "published"
            }
            type="button"
            onClick={publishCurrentSurvey}
          >
            {latestPublishedVersion ? `Publish v${latestPublishedVersion.version_number + 1}` : "Publish v1"}
          </button>
        </footer>
      </section>
  );
}

function SurveyPreview({
  branding,
  presentation,
  questions,
  templateSlug,
  title,
  surveyDescription,
  organization,
}: {
  branding: TenantBranding;
  presentation: SurveyPresentation;
  questions: SurveyQuestion[];
  templateSlug: string;
  title: string;
  surveyDescription?: string | null;
  organization: PublicOrganization;
}) {
  const stub = buildPreviewContextStub(
    {
      logo_url: branding.logo_url,
      primary_color: branding.primary_color,
      secondary_color: branding.secondary_color,
      thank_you_text: branding.thank_you_text,
    },
    {
      survey: {
        id: "preview-survey",
        title,
        slug: "preview",
        description: surveyDescription ?? null,
        default_locale: "en",
      },
      organization,
    },
  );
  const publicQuestions =
    questions.length > 0
      ? [...questions].sort((a, b) => a.sort_order - b.sort_order).map(mapSurveyQuestionToPublic)
      : TEMPLATE_GALLERY_FIXTURE_QUESTIONS;

  const hostStyle = {
    ...(branding.primary_color ? { "--color-tenant-primary": branding.primary_color } : {}),
    ...(branding.secondary_color ? { "--color-tenant-secondary": branding.secondary_color } : {}),
  } as CSSProperties;

  if (questions.length === 0) {
    return (
      <div className="admin-feedback-preview-host" style={hostStyle}>
        <EmptyState title="No preview yet" body="Add questions to preview the customer form." />
      </div>
    );
  }

  return (
    <div className="admin-feedback-preview-host" style={hostStyle}>
      <FeedbackFlow
        branding={stub.branding}
        channelCode={null}
        locationName={stub.location.name}
        organization={stub.organization}
        onSubmitAnswers={null}
        presentation={presentation}
        previewBadge="Preview only"
        questions={publicQuestions}
        surveyDescription={stub.survey.description}
        surveyTitle={stub.survey.title}
        templateSlug={templateSlug}
      />
    </div>
  );
}

function requiresOptions(questionType: QuestionType): boolean {
  return ["single_selection", "multi_selection", "dropdown"].includes(questionType);
}

function parseOptions(optionsText: string): Array<{ value: string; label: string; sort_order: number }> {
  return optionsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((label, index) => ({
      value: slugify(label).replaceAll("-", "_"),
      label,
      sort_order: index,
    }));
}

function allowsOptionalEmojiLabels(questionType: QuestionType): boolean {
  return ["csat_5", "csat_4", "csat_2"].includes(questionType);
}

function emojiLabelCount(questionType: QuestionType): number {
  switch (questionType) {
    case "csat_5":
      return 5;
    case "csat_4":
      return 4;
    case "csat_2":
      return 2;
    default:
      return 0;
  }
}

function optionalEmojiCaptionsPlaceholder(questionType: QuestionType): string {
  const n = emojiLabelCount(questionType);
  return Array.from({ length: n }, (_, index) => `Caption ${index + 1}`).join("\n");
}

function formatOptionsTextForEditor(question: SurveyQuestion): string {
  if (allowsOptionalEmojiLabels(question.question_type)) {
    return [...question.options]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((option) => option.label)
      .join("\n");
  }
  return question.options.map((option) => option.label).join("\n");
}

function buildQuestionOptions(
  questionType: QuestionType,
  optionsText: string,
): Array<{ value: string; label: string; sort_order: number }> {
  if (allowsOptionalEmojiLabels(questionType)) {
    const n = emojiLabelCount(questionType);
    const lines = optionsText.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      return [];
    }
    if (lines.length !== n) {
      throw new Error(
        `Enter exactly ${n} caption lines (one per line), or leave the field empty for default labels.`,
      );
    }
    return lines.map((label, index) => ({
      value: String(index + 1),
      label,
      sort_order: index,
    }));
  }
  if (requiresOptions(questionType)) {
    return parseOptions(optionsText);
  }
  return [];
}

function DashboardContent({
  dashboardData,
  me,
  onOpenSurveyBuilder,
  onUpdated,
}: {
  dashboardData: DashboardData;
  me?: MeResponse | null;
  onOpenSurveyBuilder: (surveyId: string) => void;
  onUpdated: () => Promise<void>;
}) {
  const activeChannels = dashboardData.channels.filter((channel) => channel.status === "active");
  const publishedSurveys = dashboardData.surveys.filter((survey) => survey.status === "published");

  return (
    <div className="section-stack">
      <div className="stat-grid">
        <StatCard label="Responses" value={dashboardData.analytics.total_responses} />
        <StatCard label="Avg NPS" value={dashboardData.analytics.nps_average ?? 0} />
        <StatCard label="Published surveys" value={publishedSurveys.length} />
        <StatCard label="Active channels" value={activeChannels.length} />
      </div>

      <section className="chart-card">
        <div className="chart-card-header">
          <h2 className="chart-card-title">Recent Feedback Channels</h2>
          <StatusBadge
            className={tenantStatusClass(dashboardData.tenant.status)}
            label={dashboardData.tenant.status}
          />
        </div>
        <ChannelTable
          channels={dashboardData.channels}
          dashboardData={dashboardData}
          limit={5}
          me={me}
          onUpdated={onUpdated}
          tenantId={dashboardData.tenant.id}
        />
      </section>

      <section className="chart-card">
        <div className="chart-card-header">
          <h2 className="chart-card-title">Surveys</h2>
        </div>
        <SurveyTable
          surveys={dashboardData.surveys}
          surveyVersions={dashboardData.surveyVersions}
          limit={5}
          me={me}
          onOpenSurveyBuilder={onOpenSurveyBuilder}
          onUpdated={onUpdated}
          tenantId={dashboardData.tenant.id}
        />
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value.toLocaleString()}</span>
    </div>
  );
}

function LocationsView({
  locations,
  me,
  onUpdated,
  tenantId,
}: {
  locations: Location[];
  me?: MeResponse | null;
  onUpdated: () => Promise<void>;
  tenantId: string;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusTab, setStatusTab] = useState("All");
  const [activeCity, setActiveCity] = useState("All cities");
  const cityChips = [
    "All cities",
    ...Array.from(new Set(locations.map((location) => location.city).filter(Boolean))).sort(),
  ] as string[];
  const filteredLocations = locations.filter((location) => {
    const matchesSearch = matchesSearchTerm(
      [location.name, location.code, location.city, location.region, location.address],
      searchTerm,
    );
    const matchesCity = activeCity === "All cities" || location.city === activeCity;
    const matchesStatus =
      statusTab === "All" ||
      (statusTab === "Active" && location.is_active) ||
      (statusTab === "Inactive" && !location.is_active);
    return matchesSearch && matchesCity && matchesStatus;
  });

  return (
    <div>
      <ChipFilterBar activeChip={statusTab} chips={["All", "Active", "Inactive"]} onChipChange={setStatusTab} />
      <FilterBar
        activeChip={activeCity}
        chips={cityChips}
        onChipChange={setActiveCity}
        onSearchChange={setSearchTerm}
        placeholder="Search locations..."
        searchValue={searchTerm}
      />
      <LocationTable locations={filteredLocations} me={me} onUpdated={onUpdated} tenantId={tenantId} />
    </div>
  );
}

function SurveysView({
  me,
  onOpenSurveyBuilder,
  onUpdated,
  surveys,
  surveyVersions,
  tenantId,
}: {
  me?: MeResponse | null;
  onOpenSurveyBuilder: (surveyId: string) => void;
  onUpdated: () => Promise<void>;
  surveys: Survey[];
  surveyVersions: SurveyVersion[];
  tenantId: string;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeStatus, setActiveStatus] = useState("All");
  const filteredSurveys = surveys.filter((survey) => {
    const matchesSearch = matchesSearchTerm(
      [survey.title, survey.slug, survey.description, survey.default_locale],
      searchTerm,
    );
    const matchesStatus = activeStatus === "All" || survey.status === activeStatus.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      <FilterBar
        activeChip={activeStatus}
        chips={["All", "Published", "Draft", "Archived"]}
        onChipChange={setActiveStatus}
        onSearchChange={setSearchTerm}
        placeholder="Search surveys..."
        searchValue={searchTerm}
      />
      <SurveyTable
        onOpenSurveyBuilder={onOpenSurveyBuilder}
        onUpdated={onUpdated}
        me={me}
        surveys={filteredSurveys}
        surveyVersions={surveyVersions}
        tenantId={tenantId}
      />
    </div>
  );
}

function ChannelsView({
  dashboardData,
  me,
  onUpdated,
  tenantId,
}: {
  dashboardData: DashboardData;
  me?: MeResponse | null;
  onUpdated: () => Promise<void>;
  tenantId: string;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeStatus, setActiveStatus] = useState("All");
  const [activeType, setActiveType] = useState("All");
  const channelTypeChips = [
    "All",
    ...Array.from(
      new Set(["qr", "kiosk", ...dashboardData.channels.map((channel) => channel.channel_type)]),
    ).sort(),
  ];
  const filteredChannels = dashboardData.channels.filter((channel) => {
    const matchesSearch = matchesSearchTerm(channelSearchValues(dashboardData, channel), searchTerm);
    const matchesStatus =
      activeStatus === "All" ||
      channel.status === (activeStatus === "Inactive" ? "disabled" : activeStatus.toLowerCase());
    const matchesType = activeType === "All" || channel.channel_type === activeType;
    return matchesSearch && matchesStatus && matchesType;
  });

  return (
    <div>
      <div className="tab-nav tab-nav--compact">
        {["All", "Active", "Inactive"].map((status) => (
          <button
            className={`tab-item ${activeStatus === status ? "active" : ""}`}
            key={status}
            onClick={() => setActiveStatus(status)}
            type="button"
          >
            {status}
          </button>
        ))}
      </div>
      <div className="filter-bar">
        <div className="search-wrap">
          <span className="material-symbols-outlined search-icon">search</span>
          <input
            className="search-input"
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search channels..."
            value={searchTerm}
          />
        </div>
        {channelTypeChips.map((chip) => (
          <button
            className={`filter-chip ${activeType === chip ? "active" : ""}`}
            key={chip}
            onClick={() => setActiveType(chip)}
            type="button"
          >
            {formatChannelType(chip)}
          </button>
        ))}
      </div>
      <ChannelTable
        channels={filteredChannels}
        dashboardData={dashboardData}
        me={me}
        onUpdated={onUpdated}
        tenantId={tenantId}
      />
    </div>
  );
}

function UsersView({
  locations,
  me,
  onUpdated,
  roles,
  tenantId,
  users,
}: {
  locations: Location[];
  me?: MeResponse | null;
  onUpdated: () => Promise<void>;
  roles: Role[];
  tenantId: string;
  users: TenantUser[];
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeStatus, setActiveStatus] = useState("All");
  const [activeRoleFilter, setActiveRoleFilter] = useState(ROLE_FILTER_ALL);

  const roleChipItems = useMemo(() => {
    const sorted = [...roles].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return [
      { value: ROLE_FILTER_ALL, label: "All" },
      ...sorted.map((role) => ({ value: role.code, label: role.name })),
    ];
  }, [roles]);

  const filteredUsers = users.filter((user) => {
    const roleCodes = user.role_bindings.map((binding) => binding.role_code);
    const matchesSearch = matchesSearchTerm(
      [user.display_name, user.email, user.status, ...roleCodes],
      searchTerm,
    );
    const matchesStatus =
      activeStatus === "All" ||
      user.status === (activeStatus === "Inactive" ? "disabled" : activeStatus.toLowerCase());
    const matchesRole =
      activeRoleFilter === ROLE_FILTER_ALL || roleCodes.includes(activeRoleFilter);
    return matchesSearch && matchesStatus && matchesRole;
  });

  return (
    <div>
      <div className="tab-nav tab-nav--compact">
        {["All", "Active", "Inactive"].map((status) => (
          <button
            className={`tab-item ${activeStatus === status ? "active" : ""}`}
            key={status}
            onClick={() => setActiveStatus(status)}
            type="button"
          >
            {status}
          </button>
        ))}
      </div>
      <FilterBar
        activeChip={activeRoleFilter}
        chipItems={roleChipItems}
        onChipChange={setActiveRoleFilter}
        onSearchChange={setSearchTerm}
        placeholder="Search users..."
        searchValue={searchTerm}
      />
      <UserTable
        locations={locations}
        me={me}
        onUpdated={onUpdated}
        roles={roles}
        tenantId={tenantId}
        users={filteredUsers}
      />
    </div>
  );
}

function RolesView({
  dashboardData,
  me,
  onUpdated,
  tenantId,
  users,
}: {
  dashboardData: DashboardData;
  me: MeResponse | null;
  onUpdated: () => Promise<void>;
  tenantId: string;
  users: TenantUser[];
}) {
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const roleCounts = new Map<string, number>();
  for (const user of users) {
    for (const binding of user.role_bindings) {
      roleCounts.set(binding.role_code, (roleCounts.get(binding.role_code) ?? 0) + 1);
    }
  }

  return (
    <div className="section-stack">
      <section className="chart-card">
        <div className="chart-card-header">
          <div>
            <h2 className="chart-card-title">Roles</h2>
            <p className="text-sm text-secondary">
              Assign granular permissions to system and custom roles.
            </p>
          </div>
          <button
            className="btn btn--primary"
            disabled={!hasClientPermission(me, "role:create")}
            type="button"
            onClick={() => setIsCreatingRole(true)}
          >
            <span className="material-symbols-outlined">add</span>
            Create Role
          </button>
        </div>
        <div className="role-grid">
          {dashboardData.roles.map((role) => (
            <article className="role-card" key={role.code}>
              <div>
                <h3>{role.name}</h3>
                <p>{role.description || "No description"}</p>
              </div>
              <div className="role-card-footer">
                <StatusBadge
                  className="badge badge--neutral"
                  label={`${roleCounts.get(role.code) ?? 0} users`}
                />
                <button
                  className="btn btn--secondary"
                  disabled={!hasClientPermission(me, "role:update")}
                  type="button"
                  onClick={() => setEditingRole(role)}
                >
                  Edit permissions
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      {editingRole ? (
        <RolePermissionsModal
          onClose={() => setEditingRole(null)}
          onSaved={async () => {
            setEditingRole(null);
            await onUpdated();
          }}
          permissions={dashboardData.permissions}
          role={editingRole}
          tenantId={tenantId}
        />
      ) : null}
      {isCreatingRole ? (
        <CreateRoleModal
          onClose={() => setIsCreatingRole(false)}
          onCreated={async () => {
            setIsCreatingRole(false);
            await onUpdated();
          }}
          permissions={dashboardData.permissions}
          tenantId={tenantId}
        />
      ) : null}
    </div>
  );
}

function CreateRoleModal({
  onClose,
  onCreated,
  permissions,
  tenantId,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
  permissions: Permission[];
  tenantId: string;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function togglePermission(permissionCode: string) {
    setSelectedPermissions((currentPermissions) =>
      currentPermissions.includes(permissionCode)
        ? currentPermissions.filter((currentPermission) => currentPermission !== permissionCode)
        : [...currentPermissions, permissionCode],
    );
  }

  async function saveRole() {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    if (!code.trim() || !name.trim()) {
      setError("Role code and name are required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await createRole(token, tenantId, {
        code: code.trim(),
        name: name.trim(),
        description: description.trim() || null,
        permission_codes: selectedPermissions,
      });
      await onCreated();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create role.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell
      error={error}
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={saveRole}
      submitLabel="Create Role"
      title="Create Role"
    >
      <div className="field-row">
        <div className="field">
          <label className="field-label" htmlFor="role-code">
            Code
          </label>
          <input
            className="field-input"
            id="role-code"
            onChange={(event) => setCode(event.target.value)}
            placeholder="regional_manager"
            value={code}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="role-name">
            Name
          </label>
          <input
            className="field-input"
            id="role-name"
            onChange={(event) => setName(event.target.value)}
            placeholder="Regional Manager"
            value={name}
          />
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="role-description">
          Description
        </label>
        <textarea
          className="field-input modal-textarea"
          id="role-description"
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
      </div>
      <PermissionChecklist
        permissions={permissions}
        selectedPermissions={selectedPermissions}
        onTogglePermission={togglePermission}
      />
    </ModalShell>
  );
}

function RolePermissionsModal({
  onClose,
  onSaved,
  permissions,
  role,
  tenantId,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  permissions: Permission[];
  role: Role;
  tenantId: string;
}) {
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(role.permission_codes);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function togglePermission(permissionCode: string) {
    setSelectedPermissions((currentPermissions) =>
      currentPermissions.includes(permissionCode)
        ? currentPermissions.filter((currentPermission) => currentPermission !== permissionCode)
        : [...currentPermissions, permissionCode],
    );
  }

  async function saveRolePermissions() {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await updateRole(token, tenantId, role.id, { permission_codes: selectedPermissions });
      await onSaved();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not update role.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell
      error={error}
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={saveRolePermissions}
      submitLabel="Save Permissions"
      title={`Edit ${role.name}`}
    >
      <PermissionChecklist
        permissions={permissions}
        selectedPermissions={selectedPermissions}
        onTogglePermission={togglePermission}
      />
    </ModalShell>
  );
}

function PermissionChecklist({
  onTogglePermission,
  permissions,
  selectedPermissions,
}: {
  onTogglePermission: (permissionCode: string) => void;
  permissions: Permission[];
  selectedPermissions: string[];
}) {
  return (
    <div className="checkbox-list checkbox-list--permissions">
      {permissions.map((permission) => (
        <label className="checkbox-row" key={permission.code}>
          <input
            checked={selectedPermissions.includes(permission.code)}
            onChange={() => onTogglePermission(permission.code)}
            type="checkbox"
          />
          <span>{formatPermissionCode(permission.code)}</span>
        </label>
      ))}
    </div>
  );
}

function FilterBar({
  activeChip,
  chipItems,
  chips,
  onChipChange,
  onSearchChange,
  placeholder,
  searchValue,
}: {
  activeChip: string;
  chipItems?: { value: string; label: string }[];
  chips?: string[];
  onChipChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  placeholder: string;
  searchValue: string;
}) {
  const resolvedItems =
    chipItems ?? (chips ?? []).map((chip) => ({ value: chip, label: chip }));

  return (
    <div className="filter-bar">
      <div className="search-wrap">
        <span className="material-symbols-outlined search-icon">search</span>
        <input
          className="search-input"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={placeholder}
          type="text"
          value={searchValue}
        />
      </div>
      {resolvedItems.map((item) => (
        <button
          className={`filter-chip ${activeChip === item.value ? "active" : ""}`}
          key={item.value}
          onClick={() => onChipChange(item.value)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function ChipFilterBar({
  activeChip,
  chips,
  onChipChange,
}: {
  activeChip: string;
  chips: string[];
  onChipChange: (chip: string) => void;
}) {
  return (
    <div className="filter-bar filter-bar--chips-only">
      {chips.map((chip) => (
        <button
          className={`filter-chip ${activeChip === chip ? "active" : ""}`}
          key={chip}
          onClick={() => onChipChange(chip)}
          type="button"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}

function LocationTable({
  locations,
  me,
  onUpdated,
  tenantId,
}: {
  locations: Location[];
  me?: MeResponse | null;
  onUpdated: () => Promise<void>;
  tenantId: string;
}) {
  const [openMenuLocationId, setOpenMenuLocationId] = useState<string | null>(null);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [archivingLocation, setArchivingLocation] = useState<Location | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canArchiveLocation = hasClientPermission(me, "location:archive");
  const rowMenuButtonRefs = useRef(new Map<string, HTMLButtonElement | null>());

  if (locations.length === 0) {
    return <EmptyState title="No locations yet" body="Add your first location to start collecting feedback." />;
  }

  async function archiveLocation(location: Location) {
    const token = getStoredAccessToken();
    if (!token) {
      setActionError("Please sign in again.");
      return;
    }

    setActionError(null);
    setOpenMenuLocationId(null);
    try {
      await updateLocation(token, tenantId, location.id, { is_active: false });
      await onUpdated();
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : "Could not archive location.");
    }
  }

  return (
    <div className="table-wrap">
      {actionError ? <div className="field-error-msg table-action-error">{actionError}</div> : null}
      <table className="location-table">
        <colgroup>
          <col className="location-col-name" />
          <col className="location-col-city" />
          <col className="location-col-status" />
          <col className="location-col-code" />
          <col className="location-col-updated" />
          <col className="location-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>Location</th>
            <th>City</th>
            <th>Status</th>
            <th>Code</th>
            <th>Last updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {locations.map((location, index) => (
            <tr key={location.id}>
              <td>
                <div className="fw-medium">{location.name}</div>
                <div className="text-sm text-secondary">
                  {location.address || location.region || "Address not set"}
                </div>
              </td>
              <td>{location.city ?? "Not set"}</td>
              <td>
                <StatusBadge
                  className={location.is_active ? "badge badge--success" : "badge badge--neutral"}
                  label={location.is_active ? "Active" : "Inactive"}
                />
              </td>
              <td>
                <code className="code-chip">{location.code}</code>
              </td>
              <td>{formatLastUpdated(location.created_at, location.updated_at)}</td>
              <td>
                <div className={`row-actions ${openMenuLocationId === location.id ? "row-actions--open" : ""}`}>
                  <button
                    ref={(element) => {
                      if (element) rowMenuButtonRefs.current.set(location.id, element);
                      else rowMenuButtonRefs.current.delete(location.id);
                    }}
                    className="btn btn--icon"
                    type="button"
                    aria-label="Location actions"
                    onClick={() =>
                      setOpenMenuLocationId((currentId) =>
                        currentId === location.id ? null : location.id,
                      )
                    }
                  >
                    <span className="material-symbols-outlined">more_vert</span>
                  </button>
                  {openMenuLocationId === location.id ? (
                    <PortalOverflowMenu
                      anchorEl={rowMenuButtonRefs.current.get(location.id) ?? null}
                      open
                      placement={index >= locations.length - 2 ? "above" : "auto"}
                      onClose={() => setOpenMenuLocationId(null)}
                    >
                      <button
                        className="row-menu-item"
                        disabled={!location.is_active}
                        type="button"
                        onClick={() => {
                          if (!location.is_active) {
                            return;
                          }
                          setEditingLocation(location);
                          setOpenMenuLocationId(null);
                        }}
                      >
                        <span className="material-symbols-outlined">edit</span>
                        Edit
                      </button>
                      <button
                        className="row-menu-item row-menu-item--danger"
                        disabled={!location.is_active || !canArchiveLocation}
                        type="button"
                        onClick={() => {
                          setArchivingLocation(location);
                          setOpenMenuLocationId(null);
                        }}
                      >
                        <span className="material-symbols-outlined">archive</span>
                        Archive
                      </button>
                    </PortalOverflowMenu>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination count={locations.length} label="locations" />
      {editingLocation ? (
        <CreateLocationModal
          location={editingLocation}
          onClose={() => setEditingLocation(null)}
          onCreated={async () => {
            setEditingLocation(null);
            await onUpdated();
          }}
          tenantId={tenantId}
        />
      ) : null}
      {archivingLocation ? (
        <ArchiveLocationModal
          location={archivingLocation}
          onArchive={archiveLocation}
          onClose={() => setArchivingLocation(null)}
        />
      ) : null}
    </div>
  );
}

function ArchiveLocationModal({
  location,
  onArchive,
  onClose,
}: {
  location: Location;
  onArchive: (location: Location) => Promise<void>;
  onClose: () => void;
}) {
  const [confirmationName, setConfirmationName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canArchive = confirmationName === location.name;

  async function submitArchive() {
    if (!canArchive) {
      return;
    }

    setIsSubmitting(true);
    await onArchive(location);
    setIsSubmitting(false);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Archive Location</h2>
        <div className="modal-body">
          <div className="warning-panel">
            <span className="material-symbols-outlined">warning</span>
            <div>
              <div className="fw-medium">This will archive {location.name}.</div>
              <p>
                Archived locations stay in the database for history, but they should no longer be used
                for new feedback collection.
              </p>
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="archive-location-name">
              Type the location name to confirm
            </label>
            <input
              className="field-input"
              id="archive-location-name"
              onChange={(event) => setConfirmationName(event.target.value)}
              placeholder={location.name}
              value={confirmationName}
            />
            <span className="field-hint">Enter exactly: {location.name}</span>
          </div>
        </div>
        <footer className="modal-footer">
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--destructive"
            disabled={!canArchive || isSubmitting}
            type="button"
            onClick={submitArchive}
          >
            {isSubmitting ? "Archiving" : "Archive Location"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function ChannelTable({
  channels,
  dashboardData,
  limit,
  me,
  onUpdated,
  tenantId,
}: {
  channels: Channel[];
  dashboardData: DashboardData;
  limit?: number;
  me?: MeResponse | null;
  onUpdated: () => Promise<void>;
  tenantId?: string;
}) {
  const [openMenuChannelId, setOpenMenuChannelId] = useState<string | null>(null);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [copyingChannel, setCopyingChannel] = useState<Channel | null>(null);
  const [archivingChannel, setArchivingChannel] = useState<Channel | null>(null);
  const [qrPosterChannel, setQrPosterChannel] = useState<Channel | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canArchiveChannel = hasClientPermission(me, "channel:archive");
  const rowMenuButtonRefs = useRef(new Map<string, HTMLButtonElement | null>());

  async function copyPublicFeedbackUrl(channel: Channel) {
    try {
      await navigator.clipboard.writeText(publicFeedbackAbsoluteUrl(channel.channel_code));
      setActionError(null);
    } catch {
      setActionError("Could not copy link. Allow clipboard access or copy the path manually.");
    }
  }

  if (channels.length === 0) {
    return <EmptyState title="No channels yet" body="Create a channel to start collecting feedback." />;
  }

  const rows = typeof limit === "number" ? channels.slice(0, limit) : channels;

  async function archiveChannel(channel: Channel) {
    const token = getStoredAccessToken();
    if (!token || !tenantId) {
      setActionError("Please sign in again.");
      return;
    }

    setActionError(null);
    setOpenMenuChannelId(null);
    try {
      await updateChannel(token, tenantId, channel.id, { status: "disabled" });
      await onUpdated();
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : "Could not archive channel.");
    }
  }

  return (
    <div className="table-wrap channel-table-wrap">
      {actionError ? <div className="field-error-msg table-action-error">{actionError}</div> : null}
      <table className="channel-table">
        <colgroup>
          <col className="channel-col-name" />
          <col className="channel-col-location" />
          <col className="channel-col-survey" />
          <col className="channel-col-template" />
          <col className="channel-col-status" />
          <col className="channel-col-type" />
          <col className="channel-col-updated" />
          <col className="channel-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>Channel Name</th>
            <th>Location</th>
            <th>Survey</th>
            <th>Template</th>
            <th>Status</th>
            <th>Type</th>
            <th>Last updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((channel, index) => {
            const locationCells = channelLocationCells(dashboardData, channel.location_id);
            const surveyLine = channelSurveyLine(dashboardData, channel.survey_version_id);
            const templateLine = templateLabelForChannel(dashboardData, channel.survey_template_id);
            return (
              <tr key={channel.id}>
              <td>
                <div className="fw-medium">{channel.name}</div>
                <div className="text-sm text-secondary">{channel.channel_code}</div>
              </td>
              <td>
                <div className="fw-medium">{locationCells.title}</div>
              </td>
              <td>
                <div className="text-sm">{surveyLine}</div>
              </td>
              <td>
                <div className="text-sm">{templateLine}</div>
              </td>
              <td className="channel-cell-status">
                <StatusBadge className={channelStatusClass(channel.status)} label={channel.status} />
              </td>
              <td className="channel-cell-type">{channel.channel_type}</td>
              <td className="channel-cell-date">
                {formatLastUpdated(channel.created_at, channel.updated_at)}
              </td>
              <td>
                <div
                  className={`channel-row-actions ${
                    openMenuChannelId === channel.id ? "channel-row-actions--open" : ""
                  }`}
                >
                  <button
                    className="btn btn--icon"
                    type="button"
                    aria-label={`Edit ${channel.name}`}
                    disabled={channel.status === "disabled"}
                    title="Edit channel"
                    onClick={() => setEditingChannel(channel)}
                  >
                    <span className="material-symbols-outlined">edit</span>
                  </button>
                  <a
                    className="btn btn--icon"
                    href={publicFeedbackAbsoluteUrl(channel.channel_code)}
                    rel="noopener noreferrer"
                    target="_blank"
                    aria-label="Open public feedback link in new tab"
                    title="Open public link"
                  >
                    <span className="material-symbols-outlined">open_in_new</span>
                  </a>
                  <button
                    className="btn btn--icon"
                    type="button"
                    aria-label="Show QR code"
                    title="QR code"
                    disabled={channel.status === "disabled"}
                    onClick={() => setQrPosterChannel(channel)}
                  >
                    <span className="material-symbols-outlined">qr_code_2</span>
                  </button>
                  <div
                    className={`channel-row-kebab ${openMenuChannelId === channel.id ? "channel-row-kebab--open" : ""}`}
                  >
                    <button
                      ref={(element) => {
                        if (element) rowMenuButtonRefs.current.set(channel.id, element);
                        else rowMenuButtonRefs.current.delete(channel.id);
                      }}
                      className="btn btn--icon"
                      type="button"
                      aria-label={`More actions for ${channel.name}`}
                      onClick={() =>
                        setOpenMenuChannelId((currentId) =>
                          currentId === channel.id ? null : channel.id,
                        )
                      }
                    >
                      <span className="material-symbols-outlined">more_vert</span>
                    </button>
                    {openMenuChannelId === channel.id ? (
                      <PortalOverflowMenu
                        anchorEl={rowMenuButtonRefs.current.get(channel.id) ?? null}
                        open
                        placement={index >= rows.length - 2 ? "above" : "auto"}
                        onClose={() => setOpenMenuChannelId(null)}
                      >
                        <button
                          className="row-menu-item"
                          type="button"
                          onClick={() => {
                            void copyPublicFeedbackUrl(channel).finally(() => setOpenMenuChannelId(null));
                          }}
                        >
                          <span className="material-symbols-outlined">content_copy</span>
                          Copy public link
                        </button>
                        <button
                          className="row-menu-item"
                          type="button"
                          disabled={channel.status === "disabled"}
                          onClick={() => {
                            setCopyingChannel(channel);
                            setOpenMenuChannelId(null);
                          }}
                        >
                          <span className="material-symbols-outlined">copy_all</span>
                          Duplicate channel
                        </button>
                        <button
                          className="row-menu-item row-menu-item--danger"
                          disabled={channel.status === "disabled" || !canArchiveChannel}
                          type="button"
                          onClick={() => {
                            setArchivingChannel(channel);
                            setOpenMenuChannelId(null);
                          }}
                        >
                          <span className="material-symbols-outlined">archive</span>
                          Archive
                        </button>
                      </PortalOverflowMenu>
                    ) : null}
                  </div>
                </div>
              </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {limit ? null : <Pagination count={channels.length} label="channels" />}
      {editingChannel ? (
        <CreateChannelModal
          channel={editingChannel}
          dashboardData={dashboardData}
          onClose={() => setEditingChannel(null)}
          onCreated={async () => {
            setEditingChannel(null);
            await onUpdated();
          }}
          tenantId={tenantId ?? dashboardData.tenant.id}
        />
      ) : null}
      {copyingChannel ? (
        <CopyChannelModal
          channel={copyingChannel}
          onClose={() => setCopyingChannel(null)}
          onCopied={async () => {
            setCopyingChannel(null);
            await onUpdated();
          }}
          tenantId={tenantId ?? dashboardData.tenant.id}
        />
      ) : null}
      {archivingChannel ? (
        <ArchiveChannelModal
          channel={archivingChannel}
          onArchive={archiveChannel}
          onClose={() => setArchivingChannel(null)}
        />
      ) : null}
      {qrPosterChannel ? (
        <ChannelQrPosterModal
          channel={qrPosterChannel}
          tenantId={tenantId ?? dashboardData.tenant.id}
          onClose={() => setQrPosterChannel(null)}
        />
      ) : null}
    </div>
  );
}

function CopyChannelModal({
  channel,
  onClose,
  onCopied,
  tenantId,
}: {
  channel: Channel;
  onClose: () => void;
  onCopied: () => Promise<void>;
  tenantId: string;
}) {
  const [name, setName] = useState(`Copy of ${channel.name}`);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitCopy() {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    if (!name.trim()) {
      setError("Channel name is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await copyChannel(token, tenantId, channel.id, { name: name.trim() });
      await onCopied();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not copy channel.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell
      error={error}
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={submitCopy}
      submitLabel="Copy Channel"
      title="Copy Channel"
    >
      <div className="field">
        <label className="field-label" htmlFor="copy-channel-source">
          Copying From
        </label>
        <input className="field-input" id="copy-channel-source" readOnly value={channel.name} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="copy-channel-name">
          New Channel Name
        </label>
        <input
          className="field-input"
          id="copy-channel-name"
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
      </div>
    </ModalShell>
  );
}

function ArchiveChannelModal({
  channel,
  onArchive,
  onClose,
}: {
  channel: Channel;
  onArchive: (channel: Channel) => Promise<void>;
  onClose: () => void;
}) {
  const [confirmationName, setConfirmationName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canArchive = confirmationName === channel.name;

  async function submitArchive() {
    if (!canArchive) {
      return;
    }

    setIsSubmitting(true);
    await onArchive(channel);
    setIsSubmitting(false);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Archive Channel</h2>
        <div className="modal-body">
          <div className="warning-panel">
            <span className="material-symbols-outlined">warning</span>
            <div>
              <div className="fw-medium">This will archive {channel.name}.</div>
              <p>Archived channels stop being active for new feedback collection.</p>
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="archive-channel-name">
              Type the channel name to confirm
            </label>
            <input
              className="field-input"
              id="archive-channel-name"
              onChange={(event) => setConfirmationName(event.target.value)}
              placeholder={channel.name}
              value={confirmationName}
            />
            <span className="field-hint">Enter exactly: {channel.name}</span>
          </div>
        </div>
        <footer className="modal-footer">
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--destructive"
            disabled={!canArchive || isSubmitting}
            type="button"
            onClick={submitArchive}
          >
            {isSubmitting ? "Archiving" : "Archive Channel"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function SurveyTable({
  limit,
  me,
  onOpenSurveyBuilder,
  onUpdated,
  surveys,
  surveyVersions,
  tenantId,
}: {
  limit?: number;
  me?: MeResponse | null;
  onOpenSurveyBuilder: (surveyId: string) => void;
  onUpdated: () => Promise<void>;
  surveys: Survey[];
  surveyVersions: SurveyVersion[];
  tenantId: string;
}) {
  const [openMenuSurveyId, setOpenMenuSurveyId] = useState<string | null>(null);
  const [archivingSurvey, setArchivingSurvey] = useState<Survey | null>(null);
  const [copyingSurvey, setCopyingSurvey] = useState<Survey | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canCopySurvey = hasClientPermission(me, "survey:copy");
  const canArchiveSurvey = hasClientPermission(me, "survey:archive");
  const canModifySurvey = (survey: Survey) =>
    hasClientPermission(me, "survey:update") &&
    (!survey.created_by_user_id || survey.created_by_user_id === me?.user_id);
  const rowMenuButtonRefs = useRef(new Map<string, HTMLButtonElement | null>());

  if (surveys.length === 0) {
    return <EmptyState title="No surveys yet" body="Create a survey before creating channels." />;
  }

  const rows = typeof limit === "number" ? surveys.slice(0, limit) : surveys;
  const latestVersions = latestSurveyVersionsBySurveyId(surveyVersions);

  async function archiveSurvey(survey: Survey) {
    const token = getStoredAccessToken();
    if (!token) {
      setActionError("Please sign in again.");
      return;
    }

    setActionError(null);
    setOpenMenuSurveyId(null);
    try {
      await updateSurvey(token, tenantId, survey.id, { status: "archived" });
      await onUpdated();
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : "Could not archive survey.");
    }
  }

  async function createSurveyVersionDraft(survey: Survey) {
    const token = getStoredAccessToken();
    if (!token) {
      setActionError("Please sign in again.");
      return;
    }

    setActionError(null);
    setOpenMenuSurveyId(null);
    try {
      await updateSurvey(token, tenantId, survey.id, { status: "draft" });
      await onUpdated();
      onOpenSurveyBuilder(survey.id);
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : "Could not create a new version.");
    }
  }

  return (
    <div className="table-wrap survey-table-wrap">
      {actionError ? <div className="field-error-msg table-action-error">{actionError}</div> : null}
      <table className="survey-table">
        <colgroup>
          <col className="survey-col-name" />
          <col className="survey-col-status" />
          <col className="survey-col-language" />
          <col className="survey-col-updated" />
          <col className="survey-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Version</th>
            <th>Last updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((survey, index) => (
            <tr key={survey.id}>
              <td>
                <div className="fw-medium">{survey.title}</div>
                <div className="text-sm text-secondary">{survey.description || "No description"}</div>
              </td>
              <td className="survey-cell-status">
                <StatusBadge className={surveyStatusClass(survey.status)} label={survey.status} />
              </td>
              <td>{formatSurveyVersionNumber(latestVersions.get(survey.id))}</td>
              <td className="survey-cell-date">
                {formatLastUpdated(survey.created_at, survey.updated_at)}
              </td>
              <td>
                <div className={`row-actions ${openMenuSurveyId === survey.id ? "row-actions--open" : ""}`}>
                  <button
                    ref={(element) => {
                      if (element) rowMenuButtonRefs.current.set(survey.id, element);
                      else rowMenuButtonRefs.current.delete(survey.id);
                    }}
                    className="btn btn--icon"
                    type="button"
                    aria-label="Survey actions"
                    onClick={() =>
                      setOpenMenuSurveyId((currentId) =>
                        currentId === survey.id ? null : survey.id,
                      )
                    }
                  >
                    <span className="material-symbols-outlined">more_vert</span>
                  </button>
                  {openMenuSurveyId === survey.id ? (
                    <PortalOverflowMenu
                      anchorEl={rowMenuButtonRefs.current.get(survey.id) ?? null}
                      open
                      placement={index >= rows.length - 2 ? "above" : "auto"}
                      onClose={() => setOpenMenuSurveyId(null)}
                    >
                      <button
                        className="row-menu-item"
                        disabled={survey.status === "archived" || !canModifySurvey(survey)}
                        type="button"
                        onClick={() => {
                          if (survey.status === "archived" || !canModifySurvey(survey)) {
                            return;
                          }
                          onOpenSurveyBuilder(survey.id);
                          setOpenMenuSurveyId(null);
                        }}
                      >
                        <span className="material-symbols-outlined">edit</span>
                        Edit
                      </button>
                      {survey.status === "published" ? (
                        <button
                          className="row-menu-item"
                          disabled={!canModifySurvey(survey)}
                          type="button"
                          onClick={() => createSurveyVersionDraft(survey)}
                        >
                          <span className="material-symbols-outlined">add_circle</span>
                          New Version
                        </button>
                      ) : null}
                      <button
                        className="row-menu-item row-menu-item--danger"
                        disabled={survey.status === "archived" || !canArchiveSurvey}
                        type="button"
                        onClick={() => {
                          setArchivingSurvey(survey);
                          setOpenMenuSurveyId(null);
                        }}
                      >
                        <span className="material-symbols-outlined">archive</span>
                        Archive
                      </button>
                      <button
                        className="row-menu-item"
                        disabled={!canCopySurvey}
                        type="button"
                        onClick={() => {
                          setCopyingSurvey(survey);
                          setOpenMenuSurveyId(null);
                        }}
                      >
                        <span className="material-symbols-outlined">content_copy</span>
                        Copy
                      </button>
                    </PortalOverflowMenu>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {limit ? null : <Pagination count={surveys.length} label="surveys" />}
      {archivingSurvey ? (
        <ArchiveSurveyModal
          onArchive={archiveSurvey}
          onClose={() => setArchivingSurvey(null)}
          survey={archivingSurvey}
        />
      ) : null}
      {copyingSurvey ? (
        <CopySurveyModal
          onClose={() => setCopyingSurvey(null)}
          onCopied={async (surveyId) => {
            setCopyingSurvey(null);
            await onUpdated();
            onOpenSurveyBuilder(surveyId);
          }}
          sourceSurvey={copyingSurvey}
          tenantId={tenantId}
        />
      ) : null}
    </div>
  );
}

function ArchiveSurveyModal({
  onArchive,
  onClose,
  survey,
}: {
  onArchive: (survey: Survey) => Promise<void>;
  onClose: () => void;
  survey: Survey;
}) {
  const [confirmationName, setConfirmationName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canArchive = confirmationName === survey.title;

  async function submitArchive() {
    if (!canArchive) {
      return;
    }

    setIsSubmitting(true);
    await onArchive(survey);
    setIsSubmitting(false);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Archive Survey</h2>
        <div className="modal-body">
          <div className="warning-panel">
            <span className="material-symbols-outlined">warning</span>
            <div>
              <div className="fw-medium">This will archive {survey.title}.</div>
              <p>
                Archived surveys cannot be edited or used for new question changes. Existing
                responses and reporting history are retained.
              </p>
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="archive-survey-name">
              Type the survey name to confirm
            </label>
            <input
              className="field-input"
              id="archive-survey-name"
              onChange={(event) => setConfirmationName(event.target.value)}
              placeholder={survey.title}
              value={confirmationName}
            />
            <span className="field-hint">Enter exactly: {survey.title}</span>
          </div>
        </div>
        <footer className="modal-footer">
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn--destructive"
            disabled={!canArchive || isSubmitting}
            type="button"
            onClick={submitArchive}
          >
            {isSubmitting ? "Archiving" : "Archive Survey"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function CopySurveyModal({
  onClose,
  onCopied,
  sourceSurvey,
  tenantId,
}: {
  onClose: () => void;
  onCopied: (surveyId: string) => Promise<void>;
  sourceSurvey: Survey;
  tenantId: string;
}) {
  const [title, setTitle] = useState(`Copy of ${sourceSurvey.title}`);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitCopy() {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    if (!title.trim()) {
      setError("Survey name is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const copiedSurvey = await copySurvey(token, tenantId, sourceSurvey.id, {
        title: title.trim(),
        slug: generateUniqueSurveySlug(title),
      });
      await onCopied(copiedSurvey.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not copy survey.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell
      error={error}
      isSubmitting={isSubmitting}
      onClose={onClose}
      onSubmit={submitCopy}
      submitLabel="Copy and Edit"
      title="Copy Survey"
    >
      <div className="field">
        <label className="field-label" htmlFor="copy-survey-source">
          Copying From
        </label>
        <input
          className="field-input"
          id="copy-survey-source"
          readOnly
          value={sourceSurvey.title}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="copy-survey-title">
          New Survey Name
        </label>
        <input
          className="field-input"
          id="copy-survey-title"
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
        <span className="field-hint">Questions and options will be copied into a new draft.</span>
      </div>
    </ModalShell>
  );
}

function UserTable({
  locations,
  me,
  onUpdated,
  roles,
  tenantId,
  users,
}: {
  locations: Location[];
  me?: MeResponse | null;
  onUpdated: () => Promise<void>;
  roles: Role[];
  tenantId: string;
  users: TenantUser[];
}) {
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const canArchiveUser = hasClientPermission(me, "user:archive");
  const rowMenuButtonRefs = useRef(new Map<string, HTMLButtonElement | null>());

  if (users.length === 0) {
    return <EmptyState title="No users yet" body="Add tenant admins, analysts, or managers." />;
  }

  const locationNames = new Map(locations.map((location) => [location.id, location.name]));

  async function archiveUser(user: TenantUser) {
    const token = getStoredAccessToken();
    if (!token) {
      setActionError("Please sign in again.");
      return;
    }

    setActionError(null);
    setOpenMenuUserId(null);
    try {
      await updateTenantUser(token, tenantId, user.id, { status: "disabled" });
      await onUpdated();
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : "Could not archive user.");
    }
  }

  return (
    <div className="table-wrap">
      {actionError ? <div className="field-error-msg table-action-error">{actionError}</div> : null}
      <table className="user-table">
        <colgroup>
          <col className="user-col-name" />
          <col className="user-col-role" />
          <col className="user-col-locations" />
          <col className="user-col-status" />
          <col className="user-col-updated" />
          <col className="user-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Locations</th>
            <th>Status</th>
            <th>Last updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, index) => {
            const primaryRole = user.role_bindings[0];
            return (
              <tr key={user.id}>
                <td>
                  <div className="fw-medium">{user.display_name}</div>
                  <div className="text-sm text-secondary">{user.email}</div>
                </td>
                <td>
                  <span className="code-chip">
                    {primaryRole ? formatRoleCode(primaryRole.role_code) : "No role"}
                  </span>
                </td>
                <td>{formatUserLocations(user, locationNames)}</td>
                <td>
                  <StatusBadge className={userStatusClass(user.status)} label={user.status} />
                </td>
                <td>{formatLastUpdated(user.created_at, user.updated_at)}</td>
                <td>
                  <div className={`row-actions ${openMenuUserId === user.id ? "row-actions--open" : ""}`}>
                    <button
                      ref={(element) => {
                        if (element) rowMenuButtonRefs.current.set(user.id, element);
                        else rowMenuButtonRefs.current.delete(user.id);
                      }}
                      className="btn btn--icon"
                      type="button"
                      aria-label="User actions"
                      onClick={() =>
                        setOpenMenuUserId((currentId) => (currentId === user.id ? null : user.id))
                      }
                    >
                      <span className="material-symbols-outlined">more_vert</span>
                    </button>
                    {openMenuUserId === user.id ? (
                      <PortalOverflowMenu
                        anchorEl={rowMenuButtonRefs.current.get(user.id) ?? null}
                        open
                        placement={index >= users.length - 2 ? "above" : "auto"}
                        onClose={() => setOpenMenuUserId(null)}
                      >
                        <button
                          className="row-menu-item"
                          type="button"
                          onClick={() => {
                            setEditingUser(user);
                            setOpenMenuUserId(null);
                          }}
                        >
                          <span className="material-symbols-outlined">edit</span>
                          Edit
                        </button>
                        <button
                          className="row-menu-item row-menu-item--danger"
                          disabled={user.status === "disabled" || !canArchiveUser}
                          type="button"
                          onClick={() => archiveUser(user)}
                        >
                          <span className="material-symbols-outlined">archive</span>
                          Archive
                        </button>
                      </PortalOverflowMenu>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Pagination count={users.length} label="users" />
      {editingUser ? (
        <CreateUserModal
          locations={locations}
          onClose={() => setEditingUser(null)}
          onCreated={async () => {
            setEditingUser(null);
            await onUpdated();
          }}
          roles={roles}
          tenantId={tenantId}
          user={editingUser}
        />
      ) : null}
    </div>
  );
}

function Pagination({ count, label }: { count: number; label: string }) {
  return (
    <div className="pagination">
      <span className="pagination-info">
        Showing 1-{count} of {count} {label}
      </span>
      <div className="pagination-controls">
        <button className="btn btn--secondary" disabled type="button">
          ← Prev
        </button>
        <button className="btn btn--secondary" disabled type="button">
          Next →
        </button>
      </div>
    </div>
  );
}

function AnalyticsView({ dashboardData }: { dashboardData: DashboardData }) {
  return (
    <div className="section-stack">
      <div className="stat-grid">
        <StatCard label="Responses" value={dashboardData.analytics.total_responses} />
        <StatCard label="Avg NPS" value={dashboardData.analytics.nps_average ?? 0} />
        <StatCard label="Avg CSAT" value={dashboardData.analytics.csat_average ?? 0} />
        <StatCard label="Active channels" value={dashboardData.analytics.active_channels} />
      </div>
      <div className="chart-placeholder">
        <span className="material-symbols-outlined chart-placeholder-icon">insights</span>
        <div className="text-secondary">Trend charts and outlet comparison come next.</div>
        <div className="text-sm text-secondary">Summary cards are powered by live response data.</div>
      </div>
    </div>
  );
}

function TemplatesView({ dashboardData }: { dashboardData: DashboardData }) {
  const brandingPreview: PublicBranding = {
    logo_url: dashboardData.branding.logo_url,
    primary_color: dashboardData.branding.primary_color,
    secondary_color: dashboardData.branding.secondary_color,
    thank_you_text: dashboardData.branding.thank_you_text,
  };

  if (dashboardData.surveyTemplates.length === 0) {
    return (
      <div className="section-stack templates-view">
        <EmptyState
          title="No templates available"
          body="Survey templates appear here when your account has channel or survey read access and the catalog has been synced."
        />
      </div>
    );
  }

  return (
    <div className="section-stack templates-view">
      <TemplateLibrarySection brandingPreview={brandingPreview} templates={dashboardData.surveyTemplates} />
    </div>
  );
}

function TemplateLibrarySection({
  brandingPreview,
  templates,
}: {
  brandingPreview: PublicBranding;
  templates: SurveyTemplate[];
}) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");

  useEffect(() => {
    setSelectedId((prev) =>
      prev && templates.some((template) => template.id === prev) ? prev : templates[0]?.id ?? "",
    );
  }, [templates]);

  const selected = templates.find((template) => template.id === selectedId) ?? templates[0];

  if (!selected) {
    return null;
  }

  const stub = buildPreviewContextStub(brandingPreview);
  const templatePresentation = normalizeSurveyPresentation(selected.presentation ?? {});
  const hostStyle = {
    ...(brandingPreview.primary_color ? { "--color-tenant-primary": brandingPreview.primary_color } : {}),
    ...(brandingPreview.secondary_color ? { "--color-tenant-secondary": brandingPreview.secondary_color } : {}),
  } as CSSProperties;

  return (
    <div className="templates-library">
      <div className="templates-library-body">
        <div className="templates-library-catalog">
          <div className="template-gallery" role="list">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                role="listitem"
                className={`template-gallery-card ${
                  template.id === selected.id ? "template-gallery-card--selected" : ""
                }`}
                onClick={() => setSelectedId(template.id)}
              >
                <div className="template-gallery-card-title">{template.name}</div>
                {template.description ? <p className="template-gallery-card-desc">{template.description}</p> : null}
                {template.deployment_notes ? (
                  <p className="template-gallery-card-tip">{template.deployment_notes}</p>
                ) : null}
              </button>
            ))}
          </div>
        </div>
        <div className="templates-library-preview">
          <header className="template-preview-panel-header">
            <span className="template-preview-badge">Preview</span>
            <h3 className="template-preview-panel-title">{selected.name}</h3>
            {selected.description ? <p className="template-preview-panel-desc">{selected.description}</p> : null}
          </header>
          <div className="template-gallery-preview-wrap template-gallery-preview-host" style={hostStyle}>
            <FeedbackFlow
              key={selected.id}
              branding={stub.branding}
              channelCode={null}
              locationName={stub.location.name}
              organization={stub.organization}
              onSubmitAnswers={null}
              presentation={templatePresentation}
              questions={TEMPLATE_GALLERY_FIXTURE_QUESTIONS}
              surveyDescription={selected.description ?? null}
              surveyTitle={stub.survey.title}
              templateSlug={selected.slug}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function OrganizationView({
  dashboardData,
  me,
  onUpdated,
}: {
  dashboardData: DashboardData;
  me: MeResponse | null;
  onUpdated: () => Promise<void>;
}) {
  const canTenantUpdate = hasClientPermission(me, "tenant:update");
  const canBrandingUpdate = hasClientPermission(me, "branding:update");

  const [organizationName, setOrganizationName] = useState(dashboardData.tenant.name);
  const [addressLine1, setAddressLine1] = useState(dashboardData.tenant.address_line1 ?? "");
  const [addressLine2, setAddressLine2] = useState(dashboardData.tenant.address_line2 ?? "");
  const [addressCity, setAddressCity] = useState(dashboardData.tenant.address_city ?? "");
  const [addressState, setAddressState] = useState(dashboardData.tenant.address_state ?? "");
  const [addressPostalCode, setAddressPostalCode] = useState(
    dashboardData.tenant.address_postal_code ?? "",
  );
  const [primaryColor, setPrimaryColor] = useState(
    dashboardData.branding.primary_color ?? "#1a73e8",
  );
  const [secondaryColor, setSecondaryColor] = useState(
    dashboardData.branding.secondary_color ?? "#e8f0fe",
  );
  const [thankYouText, setThankYouText] = useState(dashboardData.branding.thank_you_text);
  const [logoImportUrl, setLogoImportUrl] = useState("");
  const [orgError, setOrgError] = useState<string | null>(null);
  const [brandError, setBrandError] = useState<string | null>(null);
  const [logoHint, setLogoHint] = useState<string | null>(null);
  const [isSavingOrg, setIsSavingOrg] = useState(false);
  const [isSavingBrand, setIsSavingBrand] = useState(false);
  const [isLogoBusy, setIsLogoBusy] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const tenant = dashboardData.tenant;
    const branding = dashboardData.branding;
    setOrganizationName(tenant.name);
    setAddressLine1(tenant.address_line1 ?? "");
    setAddressLine2(tenant.address_line2 ?? "");
    setAddressCity(tenant.address_city ?? "");
    setAddressState(tenant.address_state ?? "");
    setAddressPostalCode(tenant.address_postal_code ?? "");
    setPrimaryColor(branding.primary_color ?? "#1a73e8");
    setSecondaryColor(branding.secondary_color ?? "#e8f0fe");
    setThankYouText(branding.thank_you_text);
    setLogoImportUrl("");
    setOrgError(null);
    setBrandError(null);
    setLogoHint(null);
    if (logoFileInputRef.current) {
      logoFileInputRef.current.value = "";
    }
  }, [dashboardData]);

  async function saveOrganization() {
    const token = getStoredAccessToken();
    if (!token) {
      setOrgError("Please sign in again.");
      return;
    }
    if (!organizationName.trim()) {
      setOrgError("Organization name is required.");
      return;
    }
    setIsSavingOrg(true);
    setOrgError(null);
    try {
      await patchTenantProfile(token, dashboardData.tenant.id, {
        name: organizationName.trim(),
        address_line1: addressLine1.trim() || null,
        address_line2: addressLine2.trim() || null,
        address_city: addressCity.trim() || null,
        address_state: addressState.trim() || null,
        address_postal_code: addressPostalCode.trim() || null,
      });
      await onUpdated();
    } catch (nextError) {
      setOrgError(nextError instanceof Error ? nextError.message : "Could not save organization.");
    } finally {
      setIsSavingOrg(false);
    }
  }

  async function saveBrandingColors() {
    const token = getStoredAccessToken();
    if (!token) {
      setBrandError("Please sign in again.");
      return;
    }
    if (!thankYouText.trim()) {
      setBrandError("Thank-you text is required.");
      return;
    }
    setIsSavingBrand(true);
    setBrandError(null);
    try {
      await updateTenantBranding(token, dashboardData.tenant.id, {
        primary_color: primaryColor.trim() || null,
        secondary_color: secondaryColor.trim() || null,
        thank_you_text: thankYouText.trim(),
      });
      await onUpdated();
    } catch (nextError) {
      setBrandError(nextError instanceof Error ? nextError.message : "Could not update branding.");
    } finally {
      setIsSavingBrand(false);
    }
  }

  async function uploadLogoFile() {
    const token = getStoredAccessToken();
    if (!token) {
      setBrandError("Please sign in again.");
      return;
    }
    const input = logoFileInputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      setBrandError("Choose a PNG, JPEG, or WebP file first.");
      return;
    }
    setIsLogoBusy(true);
    setBrandError(null);
    setLogoHint(null);
    try {
      await uploadTenantBrandingLogoFile(token, dashboardData.tenant.id, file);
      if (input) {
        input.value = "";
      }
      setLogoHint("Logo uploaded and stored locally.");
      await onUpdated();
    } catch (nextError) {
      setBrandError(nextError instanceof Error ? nextError.message : "Could not upload logo.");
    } finally {
      setIsLogoBusy(false);
    }
  }

  async function importLogoFromUrl() {
    const token = getStoredAccessToken();
    if (!token) {
      setBrandError("Please sign in again.");
      return;
    }
    const url = logoImportUrl.trim();
    if (!url) {
      setBrandError("Paste an image URL to import.");
      return;
    }
    setIsLogoBusy(true);
    setBrandError(null);
    setLogoHint(null);
    try {
      await importTenantBrandingLogoFromUrl(token, dashboardData.tenant.id, url);
      setLogoImportUrl("");
      setLogoHint("Logo imported and stored locally.");
      await onUpdated();
    } catch (nextError) {
      setBrandError(nextError instanceof Error ? nextError.message : "Could not import logo.");
    } finally {
      setIsLogoBusy(false);
    }
  }

  async function clearLogo() {
    const token = getStoredAccessToken();
    if (!token) {
      setBrandError("Please sign in again.");
      return;
    }
    setIsLogoBusy(true);
    setBrandError(null);
    setLogoHint(null);
    try {
      await updateTenantBranding(token, dashboardData.tenant.id, { logo_url: null });
      setLogoHint("Logo removed.");
      await onUpdated();
    } catch (nextError) {
      setBrandError(nextError instanceof Error ? nextError.message : "Could not remove logo.");
    } finally {
      setIsLogoBusy(false);
    }
  }

  const logoUrl = dashboardData.branding.logo_url;

  return (
    <div className="settings-wrap">
      <section className="settings-section">
        <div className="settings-label">
          <h3>Organization</h3>
          <p>Legal or display name and registered address</p>
        </div>
        <div className="settings-body">
          <div className="field">
            <label className="field-label" htmlFor="org-name">
              Organization name<span className="field-required-mark">*</span>
            </label>
            <input
              className="field-input"
              disabled={!canTenantUpdate}
              id="org-name"
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder="Organization name"
              type="text"
              value={organizationName}
            />
          </div>
          <fieldset className="org-address-fieldset">
            <legend className="field-label">Address</legend>
            <div className="field">
              <label className="field-label visually-hidden" htmlFor="org-address-line1">
                Address line 1
              </label>
              <input
                className="field-input"
                disabled={!canTenantUpdate}
                id="org-address-line1"
                onChange={(event) => setAddressLine1(event.target.value)}
                placeholder="Address line 1"
                type="text"
                value={addressLine1}
              />
            </div>
            <div className="field">
              <label className="field-label visually-hidden" htmlFor="org-address-line2">
                Address line 2
              </label>
              <input
                className="field-input"
                disabled={!canTenantUpdate}
                id="org-address-line2"
                onChange={(event) => setAddressLine2(event.target.value)}
                placeholder="Address line 2 (optional)"
                type="text"
                value={addressLine2}
              />
            </div>
            <div className="field-row field-row--tight">
              <div className="field">
                <label className="field-label" htmlFor="org-city">
                  City
                </label>
                <input
                  className="field-input"
                  disabled={!canTenantUpdate}
                  id="org-city"
                  onChange={(event) => setAddressCity(event.target.value)}
                  placeholder="City"
                  type="text"
                  value={addressCity}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="org-state">
                  State / region
                </label>
                <input
                  className="field-input"
                  disabled={!canTenantUpdate}
                  id="org-state"
                  onChange={(event) => setAddressState(event.target.value)}
                  placeholder="State"
                  type="text"
                  value={addressState}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="org-pin">
                  PIN code
                </label>
                <input
                  className="field-input"
                  disabled={!canTenantUpdate}
                  id="org-pin"
                  inputMode="numeric"
                  onChange={(event) => setAddressPostalCode(event.target.value)}
                  placeholder="PIN / postal code"
                  type="text"
                  value={addressPostalCode}
                />
              </div>
            </div>
          </fieldset>
          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor="settings-tenant-slug">
                Slug
              </label>
              <input
                className="field-input"
                id="settings-tenant-slug"
                readOnly
                type="text"
                value={dashboardData.tenant.slug}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="settings-tenant-status">
                Status
              </label>
              <input
                className="field-input"
                id="settings-tenant-status"
                readOnly
                type="text"
                value={dashboardData.tenant.status}
              />
            </div>
          </div>
          {orgError ? <div className="field-error-msg">{orgError}</div> : null}
          <div className="settings-actions">
            <button
              className="btn btn--tenant"
              disabled={!canTenantUpdate || isSavingOrg}
              onClick={saveOrganization}
              type="button"
            >
              {isSavingOrg ? "Saving…" : "Save organization"}
            </button>
          </div>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-label">
          <h3>Branding</h3>
          <p>Customer-facing feedback experience</p>
        </div>
        <div className="settings-body">
          <div className="field">
            <span className="field-label">Logo</span>
            <p className="field-hint">
              Upload a file or paste a URL — the image is copied to local storage on the server (not
              linked from elsewhere).
            </p>
            {logoUrl ? (
              <div className="organization-logo-preview">
                <img alt="" src={logoUrl} />
              </div>
            ) : (
              <p className="text-secondary text-sm">No logo uploaded yet.</p>
            )}
            <div className="organization-logo-actions">
              <input
                ref={logoFileInputRef}
                accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                className="visually-hidden"
                disabled={!canBrandingUpdate || isLogoBusy}
                id="org-logo-file"
                type="file"
              />
              <label className="btn btn--ghost" htmlFor="org-logo-file">
                Choose file…
              </label>
              <button
                className="btn btn--secondary"
                disabled={!canBrandingUpdate || isLogoBusy}
                onClick={uploadLogoFile}
                type="button"
              >
                Upload logo
              </button>
              <button
                className="btn btn--ghost"
                disabled={!canBrandingUpdate || isLogoBusy || !logoUrl}
                onClick={() => void clearLogo()}
                type="button"
              >
                Remove logo
              </button>
            </div>
            <div className="field organization-logo-url-field">
              <label className="field-label" htmlFor="org-logo-url">
                Import from URL
              </label>
              <div className="field-row organization-logo-import-row">
                <input
                  className="field-input"
                  disabled={!canBrandingUpdate || isLogoBusy}
                  id="org-logo-url"
                  onChange={(event) => setLogoImportUrl(event.target.value)}
                  placeholder="https://…"
                  type="url"
                  value={logoImportUrl}
                />
                <button
                  className="btn btn--secondary organization-logo-import-btn"
                  disabled={!canBrandingUpdate || isLogoBusy}
                  onClick={() => void importLogoFromUrl()}
                  type="button"
                >
                  Import
                </button>
              </div>
            </div>
            {logoHint ? <div className="field-success-msg">{logoHint}</div> : null}
          </div>
          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor="branding-primary">
                Primary color
              </label>
              <input
                className="field-input"
                disabled={!canBrandingUpdate}
                id="branding-primary"
                onChange={(event) => setPrimaryColor(event.target.value)}
                type="color"
                value={primaryColor}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="branding-secondary">
                Secondary color
              </label>
              <input
                className="field-input"
                disabled={!canBrandingUpdate}
                id="branding-secondary"
                onChange={(event) => setSecondaryColor(event.target.value)}
                type="color"
                value={secondaryColor}
              />
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="branding-thank-you">
              Thank-you message
            </label>
            <textarea
              className="field-input modal-textarea"
              disabled={!canBrandingUpdate}
              id="branding-thank-you"
              onChange={(event) => setThankYouText(event.target.value)}
              value={thankYouText}
            />
          </div>
          {brandError ? <div className="field-error-msg">{brandError}</div> : null}
          <div className="settings-actions">
            <button
              className="btn btn--primary"
              disabled={!canBrandingUpdate || isSavingBrand}
              onClick={saveBrandingColors}
              type="button"
            >
              {isSavingBrand ? "Saving…" : "Save branding"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-body">{body}</p>
    </div>
  );
}

function StatusBadge({ className, label }: { className: string; label: string }) {
  return (
    <span className={className}>
      <span className="badge-dot"></span>
      {label}
    </span>
  );
}

function DashboardLoading() {
  return (
    <div className="section-stack">
      <div className="stat-grid">
        <div className="stat-card">
          <div className="skeleton loading-line" />
          <div className="skeleton loading-line" />
        </div>
        <div className="stat-card">
          <div className="skeleton loading-line" />
          <div className="skeleton loading-line" />
        </div>
        <div className="stat-card">
          <div className="skeleton loading-line" />
          <div className="skeleton loading-line" />
        </div>
        <div className="stat-card">
          <div className="skeleton loading-line" />
          <div className="skeleton loading-line" />
        </div>
      </div>
    </div>
  );
}

function DashboardError({ message }: { message: string | null }) {
  return (
    <section className="chart-card">
      <EmptyState title="Could not load dashboard" body={message || "Please try signing in again."} />
    </section>
  );
}

function tenantStatusClass(status: DashboardData["tenant"]["status"]): string {
  if (status === "active") {
    return "badge badge--success";
  }
  if (status === "suspended") {
    return "badge badge--warning";
  }
  return "badge badge--neutral";
}

function channelStatusClass(status: Channel["status"]): string {
  return status === "active" ? "badge badge--success" : "badge badge--neutral";
}

function surveyStatusClass(status: Survey["status"]): string {
  return status === "published" ? "badge badge--success" : "badge badge--neutral";
}

function userStatusClass(status: TenantUser["status"]): string {
  if (status === "active") {
    return "badge badge--success";
  }
  if (status === "invited") {
    return "badge badge--info";
  }
  return "badge badge--neutral";
}

function formatRoleCode(roleCode: string): string {
  return roleCode
    .split("_")
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatPermissionCode(permissionCode: string): string {
  return permissionCode
    .replace(":", " ")
    .split(/[_\s-]+/)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatChannelType(channelType: string): string {
  if (channelType === "qr") {
    return "QR";
  }
  return channelType
    .split("_")
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatUserLocations(user: TenantUser, locationNames: Map<string, string>): string {
  const locationIds = user.role_bindings
    .map((binding) => binding.location_id)
    .filter((locationId): locationId is string => Boolean(locationId));
  if (locationIds.length === 0) {
    return "All";
  }
  return locationIds
    .map((locationId) => locationNames.get(locationId) ?? "Scoped location")
    .join(", ");
}

function latestSurveyVersionsBySurveyId(
  surveyVersions: SurveyVersion[],
): Map<string, SurveyVersion> {
  const latestVersions = new Map<string, SurveyVersion>();
  for (const version of surveyVersions) {
    const currentVersion = latestVersions.get(version.survey_id);
    if (!currentVersion || version.version_number > currentVersion.version_number) {
      latestVersions.set(version.survey_id, version);
    }
  }
  return latestVersions;
}

function formatSurveyVersionState(
  survey: Survey,
  latestVersion: SurveyVersion | undefined,
): string {
  if (!latestVersion) {
    return survey.status === "archived" ? "Archived" : "Draft";
  }
  if (survey.status === "draft") {
    return `Published v${latestVersion.version_number} + draft changes`;
  }
  if (survey.status === "archived") {
    return `Archived after v${latestVersion.version_number}`;
  }
  return `Published v${latestVersion.version_number}`;
}

function formatSurveyVersionNumber(latestVersion: SurveyVersion | undefined): number {
  return latestVersion?.version_number ?? 0;
}

function userInitials(email: string | undefined): string {
  if (!email) {
    return "TA";
  }
  return email.slice(0, 2).toUpperCase();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

/** Show updated_at when present; otherwise created_at (never-updated rows). */
function formatLastUpdated(createdAt: string, updatedAt?: string | null): string {
  const trimmed = typeof updatedAt === "string" ? updatedAt.trim() : "";
  const effective = trimmed !== "" ? trimmed : createdAt;
  return formatDate(effective);
}
