import { useEffect, useState } from "react";
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
  getStoredAccessToken,
  downloadChannelQr,
  publishSurvey,
  updateTenantBranding,
  updateLocation,
  updateChannel,
  updateTenantUser,
  updateRole,
  updateSurvey,
  updateSurveyQuestion,
} from "../../lib/adminApi";
import type {
  Channel,
  DashboardData,
  FeedbackResponse,
  Location,
  MeResponse,
  Permission,
  QuestionType,
  Role,
  Survey,
  SurveyDetail,
  SurveyQuestion,
  SurveyVersion,
  TenantUser,
} from "../../types/admin";

type PageState = "loading" | "ready" | "error";
type ActiveAdminView =
  | "dashboard"
  | "locations"
  | "surveys"
  | "channels"
  | "responses"
  | "analytics"
  | "organization"
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

export function TenantDashboardPage({ onSignedOut }: { onSignedOut: () => void }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveAdminView>("dashboard");
  const [activeCreateModal, setActiveCreateModal] = useState<CreateModalType | null>(null);
  const [isCreatingSurvey, setIsCreatingSurvey] = useState(false);
  const [activeSurveyBuilderId, setActiveSurveyBuilderId] = useState<string | null>(null);

  async function loadDashboard() {
    const token = getStoredAccessToken();
    if (!token) {
      onSignedOut();
      return;
    }

    const nextMe = await fetchMe(token);
    if (!nextMe.tenant_id) {
      throw new Error("This dashboard currently requires a tenant-scoped user.");
    }
    const nextDashboardData = await fetchTenantDashboard(
      token,
      nextMe.tenant_id,
      nextMe.permission_codes,
    );
    setMe(nextMe);
    setDashboardData(nextDashboardData);
    setPageState("ready");
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
          {canAccessSettings ? <div className="nav-section-label">Settings</div> : null}
          {can("branding:read") ? (
            <AdminNavItem
              activeView={activeView}
              icon="business"
              label="Organization"
              onSelect={setActiveView}
              view="organization"
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
          <button className="user-row" type="button" onClick={signOut}>
            <div className="avatar">{userInitials(me?.email)}</div>
            <div className="user-info">
              <div className="user-name">{me?.email ?? "Signed in"}</div>
              <div className="user-role">{me?.role_codes[0] ?? "Tenant Admin"}</div>
            </div>
            <span className="material-symbols-outlined user-menu-icon">unfold_more</span>
          </button>
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
        <main className="page-content">
          {pageState === "loading" ? <DashboardLoading /> : null}
          {pageState === "error" ? <DashboardError message={error} /> : null}
          {pageState === "ready" && dashboardData && me?.tenant_id && isCreatingSurvey ? (
            <CreateSurveyModal
              onClose={() => setIsCreatingSurvey(false)}
              onCreated={loadDashboard}
              tenantId={me.tenant_id}
            />
          ) : null}
          {pageState === "ready" && dashboardData && me?.tenant_id && activeSurveyBuilderId ? (
            <SurveyBuilderModal
              onClose={() => setActiveSurveyBuilderId(null)}
              onUpdated={loadDashboard}
              surveyId={activeSurveyBuilderId}
              surveyVersions={dashboardData.surveyVersions}
              tenantId={me.tenant_id}
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
      {activeCreateModal && dashboardData && me?.tenant_id ? (
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
          tenantId={me.tenant_id}
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
    return <ResponsesView responses={dashboardData.responses} />;
  }
  if (activeView === "analytics") {
    return <AnalyticsView dashboardData={dashboardData} />;
  }
  if (activeView === "organization") {
    return <OrganizationView dashboardData={dashboardData} onUpdated={onUpdated} />;
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
  tenantId,
}: {
  dashboardData: DashboardData;
  modalType: CreateModalType;
  onClose: () => void;
  onCreated: () => Promise<void>;
  tenantId: string;
}) {
  if (modalType === "location") {
    return <CreateLocationModal onClose={onClose} onCreated={onCreated} tenantId={tenantId} />;
  }
  if (modalType === "survey") {
    return <CreateSurveyModal onClose={onClose} onCreated={onCreated} tenantId={tenantId} />;
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
  onCreated,
  tenantId,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
  tenantId: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [defaultLocale, setDefaultLocale] = useState("en");
  const [createdSurveyId, setCreatedSurveyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
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
        default_locale: defaultLocale,
      });
      setCreatedSurveyId(survey.id);
      await onCreated();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create survey.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (createdSurveyId) {
    return (
      <SurveyBuilderModal
        onClose={onClose}
        onUpdated={onCreated}
        surveyId={createdSurveyId}
        surveyVersions={[]}
        tenantId={tenantId}
      />
    );
  }

  return (
    <section className="survey-detail-page">
      <div className="detail-page-header">
        <div>
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            <span className="material-symbols-outlined">arrow_back</span>
            Surveys
          </button>
          <h2>Create Survey</h2>
          <p>Start with the survey details, then add questions in the next step.</p>
        </div>
      </div>
      <div className="wizard-steps" aria-label="Survey creation progress">
        <div className="wizard-step wizard-step--active">
          <span>1</span>
          Survey details
        </div>
        <div className="wizard-step">
          <span>2</span>
          Questions
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="survey-title">
          Survey Name
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
        <label className="field-label" htmlFor="survey-locale">
          Default Language
        </label>
        <select
          className="field-input"
          id="survey-locale"
          onChange={(event) => setDefaultLocale(event.target.value)}
          value={defaultLocale}
        >
          <option value="en">English</option>
          <option value="hi">Hindi</option>
          <option value="ta">Tamil</option>
          <option value="te">Telugu</option>
          <option value="kn">Kannada</option>
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="survey-description">
          Description
        </label>
        <textarea
          className="field-input modal-textarea"
          id="survey-description"
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
      </div>
      {error ? <div className="field-error-msg">{error}</div> : null}
      <div className="form-footer">
        <button className="btn btn--ghost" type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn--primary" disabled={isSubmitting} type="button" onClick={submit}>
          {isSubmitting ? "Saving" : "Save and Add Questions"}
        </button>
      </div>
    </section>
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
  const [name, setName] = useState(channel?.name ?? "");
  const [locationId, setLocationId] = useState(channel?.location_id ?? dashboardData.locations[0]?.id ?? "");
  const [surveyVersionId, setSurveyVersionId] = useState(
    channel?.survey_version_id ?? dashboardData.surveyVersions[0]?.id ?? "",
  );
  const [channelType, setChannelType] = useState<"qr" | "kiosk">(channel?.channel_type ?? "qr");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    if (!name.trim() || !locationId || !surveyVersionId) {
      setError("Channel name, location, and published survey version are required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        location_id: locationId,
        survey_version_id: surveyVersionId,
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
  isSubmitting,
  onClose,
  onSubmit,
  submitLabel,
  title,
}: {
  children: ReactNode;
  error: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  title: string;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">{title}</h2>
        <div className="modal-body">{children}</div>
        {error ? <div className="field-error-msg">{error}</div> : null}
        <footer className="modal-footer">
          <button className="btn btn--ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" disabled={isSubmitting} type="button" onClick={onSubmit}>
            {isSubmitting ? "Saving" : submitLabel}
          </button>
        </footer>
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

function matchesSearchTerm(values: Array<string | null | undefined>, searchTerm: string): boolean {
  const normalizedSearch = searchTerm.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }
  return values.some((value) => value?.toLowerCase().includes(normalizedSearch));
}

function SurveyBuilderModal({
  onClose,
  onUpdated,
  surveyId,
  surveyVersions,
  tenantId,
}: {
  onClose: () => void;
  onUpdated: () => Promise<void>;
  surveyId: string;
  surveyVersions: SurveyVersion[];
  tenantId: string;
}) {
  const [surveyDetail, setSurveyDetail] = useState<SurveyDetail | null>(null);
  const [builderMode, setBuilderMode] = useState<"editor" | "preview">("editor");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionType, setQuestionType] = useState<QuestionType>("nps");
  const [prompt, setPrompt] = useState("");
  const [questionKey, setQuestionKey] = useState("");
  const [helpText, setHelpText] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [isPii, setIsPii] = useState(false);
  const [isRequired, setIsRequired] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const editingQuestion = surveyDetail?.questions.find((question) => question.id === editingQuestionId);
  const latestPublishedVersion = surveyDetail
    ? latestSurveyVersionsBySurveyId(surveyVersions).get(surveyDetail.id)
    : undefined;
  const isPublishedLocked = surveyDetail?.status === "published";

  function resetQuestionForm() {
    setEditingQuestionId(null);
    setQuestionType("nps");
    setPrompt("");
    setQuestionKey("");
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
    setQuestionKey(question.question_key);
    setHelpText(question.help_text ?? "");
    setOptionsText(question.options.map((option) => option.label).join("\n"));
    setIsPii(question.is_pii);
    setIsRequired(question.is_required);
    setBuilderMode("editor");
  }

  function updatePrompt(nextPrompt: string) {
    setPrompt(nextPrompt);
    if (!questionKey) {
      setQuestionKey(slugify(nextPrompt).replaceAll("-", "_"));
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
    if (!prompt.trim() || !questionKey.trim()) {
      setError("Question prompt and key are required.");
      return;
    }

    const options = parseOptions(optionsText);
    if (requiresOptions(questionType) && options.length === 0) {
      setError("This question type requires at least one option.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        question_key: questionKey.trim(),
        question_type: questionType,
        prompt: prompt.trim(),
        help_text: helpText.trim() || undefined,
        is_required: isRequired,
        is_pii: isPii,
        sort_order: editingQuestion?.sort_order ?? surveyDetail?.questions.length ?? 0,
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
    if (!surveyDetail?.questions.length) {
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
            {surveyDetail?.questions.length ? (
              <div className="question-list">
                {surveyDetail.questions.map((question, index) => (
                  <button
                    className={`question-row ${editingQuestionId === question.id ? "question-row--active" : ""}`}
                    key={question.id}
                    disabled={isPublishedLocked}
                    type="button"
                    onClick={() => editQuestion(question)}
                  >
                    <div className="question-index">{index + 1}</div>
                    <div>
                      <div className="fw-medium">{question.prompt}</div>
                      <div className="text-sm text-secondary">
                        {question.question_type} · {question.question_key}
                      </div>
                    </div>
                    <span className="material-symbols-outlined question-row-edit">edit</span>
                  </button>
                ))}
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
              <SurveyPreview questions={surveyDetail?.questions ?? []} title={surveyDetail?.title ?? "Survey"} />
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
                      <option value="nps">NPS</option>
                      <option value="csat">CSAT</option>
                      <option value="single_selection">Single Selection</option>
                      <option value="multi_selection">Multi Selection</option>
                      <option value="plain_text">Plain Text</option>
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
                      onChange={(event) => updatePrompt(event.target.value)}
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
                  <div className="field">
                    <label className="field-label" htmlFor="builder-key">
                      Question Key
                    </label>
                    <input
                      className="field-input"
                      id="builder-key"
                      onChange={(event) => setQuestionKey(event.target.value)}
                      value={questionKey}
                    />
                    <span className="field-hint">Internal analytics key. Auto-generated from the prompt.</span>
                  </div>
                  {requiresOptions(questionType) ? (
                    <div className="field">
                      <label className="field-label" htmlFor="builder-options">
                        Options
                      </label>
                      <textarea
                        className="field-input modal-textarea"
                        id="builder-options"
                        onChange={(event) => setOptionsText(event.target.value)}
                        placeholder="One option per line, e.g.&#10;Food quality&#10;Service&#10;Ambience"
                        value={optionsText}
                      />
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
              !surveyDetail?.questions.length ||
              surveyDetail.status === "published"
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

function SurveyPreview({ questions, title }: { questions: SurveyQuestion[]; title: string }) {
  return (
    <div className="survey-preview">
      <div className="public-progress preview-progress">
        <div className="public-progress-value" />
      </div>
      <div className="preview-card-header">
        <div className="tenant-logo-fallback">{title.slice(0, 1).toUpperCase() || "G"}</div>
        <h3>{title}</h3>
        <p>Preview of the full feedback form</p>
      </div>
      <div className="preview-question-stack">
        {questions.length === 0 ? (
          <EmptyState title="No preview yet" body="Add questions to preview the customer form." />
        ) : (
          questions.map((question, index) => (
            <div className="preview-question" key={question.id}>
              <div className="question-kicker">
                Question {index + 1} of {questions.length}
              </div>
              <h4>{question.prompt}</h4>
              {question.help_text ? <p>{question.help_text}</p> : null}
              <PreviewAnswer question={question} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PreviewAnswer({ question }: { question: SurveyQuestion }) {
  if (question.question_type === "nps") {
    return (
      <div className="preview-scale">
        {Array.from({ length: 11 }, (_, score) => (
          <span key={score}>{score}</span>
        ))}
      </div>
    );
  }
  if (question.question_type === "csat") {
    return (
      <div className="preview-scale preview-scale--csat">
        {[1, 2, 3, 4, 5].map((score) => (
          <span key={score}>{score}</span>
        ))}
      </div>
    );
  }
  if (question.question_type === "plain_text") {
    return <div className="preview-textarea">Text response</div>;
  }
  return (
    <div className="preview-options">
      {question.options.map((option) => (
        <span key={option.id}>{option.label}</span>
      ))}
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
    return matchesSearch && matchesCity;
  });

  return (
    <div>
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
    const matchesSearch = matchesSearchTerm(
      [channel.name, channel.channel_code, channel.channel_type, channel.status],
      searchTerm,
    );
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
  const [activeRole, setActiveRole] = useState("All");
  const roleByChip: Record<string, string> = {
    "Tenant admins": "tenant_admin",
    Managers: "location_manager",
    Analysts: "analyst",
  };
  const filteredUsers = users.filter((user) => {
    const roleCodes = user.role_bindings.map((binding) => binding.role_code);
    const matchesSearch = matchesSearchTerm(
      [user.display_name, user.email, user.status, ...roleCodes],
      searchTerm,
    );
    const matchesStatus =
      activeStatus === "All" ||
      user.status === (activeStatus === "Inactive" ? "disabled" : activeStatus.toLowerCase());
    const matchesRole = activeRole === "All" || roleCodes.includes(roleByChip[activeRole]);
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
        activeChip={activeRole}
        chips={["All", "Tenant admins", "Managers", "Analysts"]}
        onChipChange={setActiveRole}
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

function ResponsesView({ responses }: { responses: FeedbackResponse[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("Recent");
  const filteredResponses = responses.filter((response) => {
    const answerText = response.answers.flatMap((answer) => [
      answer.question_key,
      answer.question_type,
      answer.is_pii ? "PII hidden" : String(answer.value ?? ""),
    ]);
    const matchesSearch = matchesSearchTerm(
      [response.location_name, response.channel_name, response.locale, ...answerText],
      searchTerm,
    );
    const matchesFilter =
      activeFilter === "Recent" ||
      (activeFilter === "With PII" && response.answers.some((answer) => answer.is_pii)) ||
      response.answers.some((answer) => answer.question_type.toLowerCase() === activeFilter.toLowerCase());
    return matchesSearch && matchesFilter;
  });

  return (
    <div>
      <FilterBar
        activeChip={activeFilter}
        chips={["Recent", "With PII", "NPS", "CSAT"]}
        onChipChange={setActiveFilter}
        onSearchChange={setSearchTerm}
        placeholder="Search responses..."
        searchValue={searchTerm}
      />
      {filteredResponses.length === 0 ? (
        <EmptyState title="No responses yet" body="Submit public feedback to see responses here." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Location</th>
                <th>Channel</th>
                <th>Answers</th>
                <th>Locale</th>
              </tr>
            </thead>
            <tbody>
              {filteredResponses.map((response) => (
                <tr key={response.id}>
                  <td>{formatDate(response.submitted_at)}</td>
                  <td>{response.location_name}</td>
                  <td>{response.channel_name}</td>
                  <td>
                    <div className="answer-chip-list">
                      {response.answers.slice(0, 3).map((answer) => (
                        <span className="code-chip" key={answer.question_key}>
                          {answer.question_key}: {answer.is_pii ? "PII hidden" : String(answer.value)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>{response.locale}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination count={filteredResponses.length} label="responses" />
        </div>
      )}
    </div>
  );
}

function FilterBar({
  activeChip,
  chips,
  onChipChange,
  onSearchChange,
  placeholder,
  searchValue,
}: {
  activeChip: string;
  chips: string[];
  onChipChange: (chip: string) => void;
  onSearchChange: (value: string) => void;
  placeholder: string;
  searchValue: string;
}) {
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
          <col className="location-col-created" />
          <col className="location-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>Location</th>
            <th>City</th>
            <th>Status</th>
            <th>Code</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {locations.map((location, index) => (
            <tr
              key={location.id}
              onMouseLeave={() => {
                if (openMenuLocationId === location.id) {
                  setOpenMenuLocationId(null);
                }
              }}
            >
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
              <td>{formatDate(location.created_at)}</td>
              <td>
                <div className={`row-actions ${openMenuLocationId === location.id ? "row-actions--open" : ""}`}>
                  <button
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
                    <div className={`row-menu ${index >= locations.length - 2 ? "row-menu--up" : ""}`}>
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
                    </div>
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
  const [actionError, setActionError] = useState<string | null>(null);
  const canArchiveChannel = hasClientPermission(me, "channel:archive");

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

  async function downloadQr(channel: Channel, format: "png" | "svg") {
    const token = getStoredAccessToken();
    if (!token || !tenantId) {
      setActionError("Please sign in again.");
      return;
    }

    setActionError(null);
    try {
      await downloadChannelQr(token, tenantId, channel, format);
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : "Could not download QR.");
    }
  }

  return (
    <div className="table-wrap">
      {actionError ? <div className="field-error-msg table-action-error">{actionError}</div> : null}
      <table className="channel-table">
        <colgroup>
          <col className="channel-col-name" />
          <col className="channel-col-status" />
          <col className="channel-col-type" />
          <col className="channel-col-link" />
          <col className="channel-col-created" />
          <col className="channel-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>Channel Name</th>
            <th>Status</th>
            <th>Type</th>
            <th>Public Link</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((channel, index) => (
            <tr
              key={channel.id}
              onMouseLeave={() => {
                if (openMenuChannelId === channel.id) {
                  setOpenMenuChannelId(null);
                }
              }}
            >
              <td>
                <div className="fw-medium">{channel.name}</div>
                <div className="text-sm text-secondary">{channel.channel_code}</div>
              </td>
              <td>
                <StatusBadge className={channelStatusClass(channel.status)} label={channel.status} />
              </td>
              <td>{channel.channel_type}</td>
              <td>
                <code className="code-chip">/f/{channel.channel_code}</code>
              </td>
              <td>{formatDate(channel.created_at)}</td>
              <td>
                <div className={`row-actions ${openMenuChannelId === channel.id ? "row-actions--open" : ""}`}>
                  <button
                    className="btn btn--icon"
                    type="button"
                    aria-label="Channel actions"
                    onClick={() =>
                      setOpenMenuChannelId((currentId) =>
                        currentId === channel.id ? null : channel.id,
                      )
                    }
                  >
                    <span className="material-symbols-outlined">more_vert</span>
                  </button>
                  {openMenuChannelId === channel.id ? (
                    <div className={`row-menu ${index >= rows.length - 2 ? "row-menu--up" : ""}`}>
                      <a className="row-menu-item" href={`/f/${channel.channel_code}`}>
                        <span className="material-symbols-outlined">open_in_new</span>
                        Open
                      </a>
                      <button className="row-menu-item" type="button" onClick={() => setEditingChannel(channel)}>
                        <span className="material-symbols-outlined">edit</span>
                        Edit
                      </button>
                      <button className="row-menu-item" type="button" onClick={() => setCopyingChannel(channel)}>
                        <span className="material-symbols-outlined">content_copy</span>
                        Copy
                      </button>
                      <button className="row-menu-item" type="button" onClick={() => downloadQr(channel, "png")}>
                        <span className="material-symbols-outlined">qr_code</span>
                        QR PNG
                      </button>
                      <button className="row-menu-item" type="button" onClick={() => downloadQr(channel, "svg")}>
                        <span className="material-symbols-outlined">download</span>
                        QR SVG
                      </button>
                      <button
                        className="row-menu-item row-menu-item--danger"
                        disabled={channel.status === "disabled" || !canArchiveChannel}
                        type="button"
                        onClick={() => setArchivingChannel(channel)}
                      >
                        <span className="material-symbols-outlined">archive</span>
                        Archive
                      </button>
                    </div>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
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
    <div className="table-wrap">
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
            <th>Last Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((survey, index) => (
            <tr
              key={survey.id}
              onMouseLeave={() => {
                if (openMenuSurveyId === survey.id) {
                  setOpenMenuSurveyId(null);
                }
              }}
            >
              <td>
                <div className="fw-medium">{survey.title}</div>
                <div className="text-sm text-secondary">{survey.description || "No description"}</div>
              </td>
              <td>
                <StatusBadge className={surveyStatusClass(survey.status)} label={survey.status} />
              </td>
              <td>{formatSurveyVersionNumber(latestVersions.get(survey.id))}</td>
              <td>{formatDate(survey.updated_at)}</td>
              <td>
                <div className={`row-actions ${openMenuSurveyId === survey.id ? "row-actions--open" : ""}`}>
                  <button
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
                    <div className={`row-menu ${index >= rows.length - 2 ? "row-menu--up" : ""}`}>
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
                    </div>
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
          <col className="user-col-created" />
          <col className="user-col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Locations</th>
            <th>Status</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, index) => {
            const primaryRole = user.role_bindings[0];
            return (
              <tr
                key={user.id}
                onMouseLeave={() => {
                  if (openMenuUserId === user.id) {
                    setOpenMenuUserId(null);
                  }
                }}
              >
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
                <td>{formatDate(user.created_at)}</td>
                <td>
                  <div className={`row-actions ${openMenuUserId === user.id ? "row-actions--open" : ""}`}>
                    <button
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
                      <div className={`row-menu ${index >= users.length - 2 ? "row-menu--up" : ""}`}>
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
                      </div>
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

function OrganizationView({
  dashboardData,
  onUpdated,
}: {
  dashboardData: DashboardData;
  onUpdated: () => Promise<void>;
}) {
  const [logoUrl, setLogoUrl] = useState(dashboardData.branding.logo_url ?? "");
  const [primaryColor, setPrimaryColor] = useState(
    dashboardData.branding.primary_color ?? "#1a73e8",
  );
  const [secondaryColor, setSecondaryColor] = useState(
    dashboardData.branding.secondary_color ?? "#e8f0fe",
  );
  const [thankYouText, setThankYouText] = useState(dashboardData.branding.thank_you_text);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function saveBranding() {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Please sign in again.");
      return;
    }
    if (!thankYouText.trim()) {
      setError("Thank-you text is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await updateTenantBranding(token, dashboardData.tenant.id, {
        logo_url: logoUrl.trim() || null,
        primary_color: primaryColor.trim() || null,
        secondary_color: secondaryColor.trim() || null,
        thank_you_text: thankYouText.trim(),
      });
      await onUpdated();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not update branding.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="settings-wrap">
      <section className="settings-section">
        <div className="settings-label">
          <h3>Organization</h3>
          <p>Core organization details for this tenant</p>
        </div>
        <div className="settings-body">
          <div className="field">
            <label className="field-label" htmlFor="settings-tenant">
              Organization Name
            </label>
            <input
              className="field-input"
              id="settings-tenant"
              readOnly
              type="text"
              value={dashboardData.tenant.name}
            />
          </div>
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
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-label">
          <h3>Branding</h3>
          <p>Controls the customer-facing feedback page for this tenant</p>
        </div>
        <div className="settings-body">
          <div className="field">
            <label className="field-label" htmlFor="branding-logo">
              Logo URL
            </label>
            <input
              className="field-input"
              id="branding-logo"
              onChange={(event) => setLogoUrl(event.target.value)}
              placeholder="https://example.com/logo.png"
              value={logoUrl}
            />
            <span className="field-hint">Use a public image URL for now. Upload storage comes later.</span>
          </div>
          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor="branding-primary">
                Primary Color
              </label>
              <input
                className="field-input"
                id="branding-primary"
                onChange={(event) => setPrimaryColor(event.target.value)}
                type="color"
                value={primaryColor}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="branding-secondary">
                Secondary Color
              </label>
              <input
                className="field-input"
                id="branding-secondary"
                onChange={(event) => setSecondaryColor(event.target.value)}
                type="color"
                value={secondaryColor}
              />
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="branding-thank-you">
              Thank-you Message
            </label>
            <textarea
              className="field-input modal-textarea"
              id="branding-thank-you"
              onChange={(event) => setThankYouText(event.target.value)}
              value={thankYouText}
            />
          </div>
          {error ? <div className="field-error-msg">{error}</div> : null}
          <div className="settings-actions">
            <button
              className="btn btn--primary"
              disabled={isSubmitting}
              onClick={saveBranding}
              type="button"
            >
              {isSubmitting ? "Saving" : "Save Branding"}
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
