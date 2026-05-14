import type {
  AnalyticsSummary,
  Channel,
  Csat2DashboardPayload,
  DashboardData,
  FeedbackResponse,
  FeedbackResponseListPage,
  Location,
  MeResponse,
  NpsDashboardPayload,
  Permission,
  QuestionType,
  ResponseAggregateReport,
  Role,
  Survey,
  SurveyDetail,
  SurveyQuestion,
  SurveyTemplate,
  SurveyVersion,
  Tenant,
  TenantBranding,
  TenantUser,
  TokenResponse,
} from "../types/admin";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
/** Split deploy: base URL for Template Admin service (`/survey-templates`). Defaults to main API when monolithic.*/
const TEMPLATE_API_BASE_URL = import.meta.env.VITE_TEMPLATE_API_BASE_URL ?? API_BASE_URL;
const ACCESS_TOKEN_KEY = "goliSoda.accessToken";
const REFRESH_TOKEN_KEY = "goliSoda.refreshToken";

type ApiValidationError = {
  loc?: Array<string | number>;
  msg?: string;
};

export function getStoredAccessToken(): string | null {
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function storeTokens(tokens: TokenResponse): void {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

export function clearStoredTokens(): void {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

type AuthenticatedFetchOptions = RequestInit & { baseUrl?: string };

async function errorMessageFromResponse(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body.detail === "string") {
      return body.detail;
    }
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((item: ApiValidationError) => {
          const fieldPath = Array.isArray(item.loc) ? item.loc.join(".") : "field";
          return `${fieldPath}: ${item.msg ?? "Invalid value"}`;
        })
        .join(" ");
    }
  } catch {
    return "We could not load this page.";
  }
  return "We could not load this page.";
}

async function authenticatedFetch<T>(
  path: string,
  token: string,
  options: AuthenticatedFetchOptions = {},
): Promise<T> {
  const { baseUrl, headers, ...rest } = options;
  const resolvedBase = baseUrl ?? API_BASE_URL;

  const response = await fetch(`${resolvedBase}${path}`, {
    ...rest,
    headers: {
      ...(rest.body ? { "Content-Type": "application/json" } : {}),
      ...headers,
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    clearStoredTokens();
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (!response.ok) {
    throw new Error(await errorMessageFromResponse(response));
  }

  return response.json();
}

export function channelQrDownloadUrl(
  tenantId: string,
  channelId: string,
  format: "png" | "svg",
): string {
  return `${API_BASE_URL}/tenants/${tenantId}/channels/${channelId}/qr.${format}`;
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error("Invalid email or password.");
  }

  return response.json();
}

export async function fetchMe(token: string): Promise<MeResponse> {
  return authenticatedFetch<MeResponse>("/auth/me", token);
}

export const ACTIVE_TENANT_STORAGE_KEY = "goliSoda.activeTenantId";

/** Recent org switches for multi-tenant operators (localStorage, capped list). */
export const RECENT_ORGANIZATIONS_STORAGE_KEY = "goliSoda.recentOrganizationIds";

const MAX_RECENT_ORGANIZATIONS = 12;

type RecentOrganizationEntry = { id: string; visitedAt: number };

export function readRecentOrganizations(): RecentOrganizationEntry[] {
  try {
    const raw = window.localStorage.getItem(RECENT_ORGANIZATIONS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const out: RecentOrganizationEntry[] = [];
    for (const item of parsed) {
      if (
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        "visitedAt" in item &&
        typeof (item as RecentOrganizationEntry).id === "string" &&
        typeof (item as RecentOrganizationEntry).visitedAt === "number"
      ) {
        out.push(item as RecentOrganizationEntry);
      }
    }
    return out.slice(0, MAX_RECENT_ORGANIZATIONS);
  } catch {
    return [];
  }
}

/** Call after successfully loading a tenant context (platform operators only). */
export function recordOrganizationVisit(tenantId: string): void {
  const without = readRecentOrganizations().filter((e) => e.id !== tenantId);
  const next: RecentOrganizationEntry[] = [
    { id: tenantId, visitedAt: Date.now() },
    ...without,
  ].slice(0, MAX_RECENT_ORGANIZATIONS);
  window.localStorage.setItem(RECENT_ORGANIZATIONS_STORAGE_KEY, JSON.stringify(next));
}

export async function fetchTenantList(token: string): Promise<Tenant[]> {
  return authenticatedFetch<Tenant[]>("/tenants", token);
}

export async function fetchTenantDashboard(
  token: string,
  tenantId: string,
  permissionCodes: string[] = [],
): Promise<DashboardData> {
  const can = (permissionCode: string) => permissionCodes.includes(permissionCode);
  const canTemplates = can("survey:read") || can("channel:read");
  const [
    tenant,
    branding,
    locations,
    surveys,
    surveyVersions,
    surveyTemplates,
    channels,
    users,
    roles,
    permissions,
    responses,
    analytics,
  ] = await Promise.all([
    authenticatedFetch<Tenant>(`/tenants/${tenantId}`, token),
    can("branding:read")
      ? authenticatedFetch<TenantBranding>(`/tenants/${tenantId}/branding`, token)
      : Promise.resolve(emptyBranding(tenantId)),
    can("location:read") ? authenticatedFetch<Location[]>(`/tenants/${tenantId}/locations`, token) : [],
    can("survey:read") ? authenticatedFetch<Survey[]>(`/tenants/${tenantId}/surveys`, token) : [],
    can("survey:read")
      ? authenticatedFetch<SurveyVersion[]>(`/tenants/${tenantId}/surveys/versions`, token)
      : [],
    canTemplates
      ? authenticatedFetch<SurveyTemplate[]>("/survey-templates", token, { baseUrl: TEMPLATE_API_BASE_URL })
      : Promise.resolve([]),
    can("channel:read") ? authenticatedFetch<Channel[]>(`/tenants/${tenantId}/channels`, token) : [],
    can("user:read") ? authenticatedFetch<TenantUser[]>(`/tenants/${tenantId}/users`, token) : [],
    can("role:read") ? authenticatedFetch<Role[]>(`/tenants/${tenantId}/roles`, token) : [],
    can("role:read") ? authenticatedFetch<Permission[]>(`/tenants/${tenantId}/permissions`, token) : [],
    Promise.resolve([] as FeedbackResponse[]),
    can("analytics:read")
      ? authenticatedFetch<AnalyticsSummary>(`/tenants/${tenantId}/analytics/summary`, token)
      : Promise.resolve({ total_responses: 0, nps_average: null, csat_average: null, active_channels: 0 }),
  ]);

  return {
    tenant,
    branding,
    locations,
    surveys,
    surveyVersions,
    surveyTemplates,
    channels,
    users,
    roles,
    permissions,
    responses,
    analytics,
  };
}

export async function fetchFeedbackResponsesPage(
  token: string,
  tenantId: string,
  params: {
    channel_id?: string;
    survey_version_id?: string;
    submitted_after?: string;
    submitted_before?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<FeedbackResponseListPage> {
  const search = new URLSearchParams();
  if (params.channel_id) search.set("channel_id", params.channel_id);
  if (params.survey_version_id) search.set("survey_version_id", params.survey_version_id);
  if (params.submitted_after) search.set("submitted_after", params.submitted_after);
  if (params.submitted_before) search.set("submitted_before", params.submitted_before);
  if (typeof params.limit === "number") search.set("limit", String(params.limit));
  if (typeof params.offset === "number") search.set("offset", String(params.offset));
  const query = search.toString();
  const path = `/tenants/${tenantId}/responses${query ? `?${query}` : ""}`;
  return authenticatedFetch<FeedbackResponseListPage>(path, token);
}

export async function fetchResponseAggregateReport(
  token: string,
  tenantId: string,
  params: {
    channel_id?: string;
    survey_version_id?: string;
    submitted_after?: string;
    submitted_before?: string;
  },
): Promise<ResponseAggregateReport> {
  const search = new URLSearchParams();
  if (params.channel_id) {
    search.set("channel_id", params.channel_id);
  }
  if (params.survey_version_id) {
    search.set("survey_version_id", params.survey_version_id);
  }
  if (params.submitted_after) {
    search.set("submitted_after", params.submitted_after);
  }
  if (params.submitted_before) {
    search.set("submitted_before", params.submitted_before);
  }
  const q = search.toString();
  return authenticatedFetch<ResponseAggregateReport>(
    `/tenants/${tenantId}/responses/aggregate${q ? `?${q}` : ""}`,
    token,
  );
}

export async function fetchNpsAnalyticsDashboard(
  token: string,
  tenantId: string,
  params: {
    channel_id?: string;
    survey_version_id?: string;
    question_key: string;
  },
): Promise<NpsDashboardPayload> {
  const search = new URLSearchParams();
  if (params.channel_id) {
    search.set("channel_id", params.channel_id);
  }
  if (params.survey_version_id) {
    search.set("survey_version_id", params.survey_version_id);
  }
  search.set("question_key", params.question_key);
  return authenticatedFetch<NpsDashboardPayload>(
    `/tenants/${tenantId}/analytics/nps-dashboard?${search.toString()}`,
    token,
  );
}

export async function fetchCsat2AnalyticsDashboard(
  token: string,
  tenantId: string,
  params: {
    channel_id?: string;
    survey_version_id?: string;
    question_key: string;
  },
): Promise<Csat2DashboardPayload> {
  const search = new URLSearchParams();
  if (params.channel_id) {
    search.set("channel_id", params.channel_id);
  }
  if (params.survey_version_id) {
    search.set("survey_version_id", params.survey_version_id);
  }
  search.set("question_key", params.question_key);
  return authenticatedFetch<Csat2DashboardPayload>(
    `/tenants/${tenantId}/analytics/csat2-dashboard?${search.toString()}`,
    token,
  );
}

function emptyBranding(tenantId: string): TenantBranding {
  const timestamp = new Date().toISOString();
  return {
    id: "",
    tenant_id: tenantId,
    logo_url: null,
    primary_color: null,
    secondary_color: null,
    thank_you_text: "Thank you for your feedback.",
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export async function createLocation(
  token: string,
  tenantId: string,
  payload: {
    name: string;
    code: string;
    city?: string;
    region?: string;
    address?: string;
  },
): Promise<Location> {
  return authenticatedFetch<Location>(`/tenants/${tenantId}/locations`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateLocation(
  token: string,
  tenantId: string,
  locationId: string,
  payload: {
    name?: string;
    code?: string;
    city?: string | null;
    region?: string | null;
    address?: string | null;
    is_active?: boolean;
  },
): Promise<Location> {
  return authenticatedFetch<Location>(`/tenants/${tenantId}/locations/${locationId}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function createSurvey(
  token: string,
  tenantId: string,
  payload: {
    title: string;
    slug: string;
    description?: string;
    default_locale: string;
  },
): Promise<Survey> {
  return authenticatedFetch<Survey>(`/tenants/${tenantId}/surveys`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSurvey(
  token: string,
  tenantId: string,
  surveyId: string,
  payload: {
    status?: "draft" | "published" | "archived";
  },
): Promise<Survey> {
  return authenticatedFetch<Survey>(`/tenants/${tenantId}/surveys/${surveyId}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function copySurvey(
  token: string,
  tenantId: string,
  surveyId: string,
  payload: {
    title: string;
    slug: string;
  },
): Promise<Survey> {
  return authenticatedFetch<Survey>(`/tenants/${tenantId}/surveys/${surveyId}/copy`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createChannel(
  token: string,
  tenantId: string,
  payload: {
    name: string;
    location_id: string;
    survey_version_id: string;
    survey_template_id: string;
    channel_type: "qr" | "kiosk";
  },
): Promise<Channel> {
  return authenticatedFetch<Channel>(`/tenants/${tenantId}/channels`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateChannel(
  token: string,
  tenantId: string,
  channelId: string,
  payload: {
    name?: string;
    location_id?: string;
    survey_version_id?: string;
    survey_template_id?: string;
    channel_type?: "qr" | "kiosk";
    status?: "active" | "disabled";
  },
): Promise<Channel> {
  return authenticatedFetch<Channel>(`/tenants/${tenantId}/channels/${channelId}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function copyChannel(
  token: string,
  tenantId: string,
  channelId: string,
  payload: { name: string },
): Promise<Channel> {
  return authenticatedFetch<Channel>(`/tenants/${tenantId}/channels/${channelId}/copy`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function downloadChannelQr(
  token: string,
  tenantId: string,
  channel: Channel,
  format: "png" | "svg",
): Promise<void> {
  const response = await fetch(channelQrDownloadUrl(tenantId, channel.id, format), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(await errorMessageFromResponse(response));
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${channel.channel_code}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function fetchChannelQrPngBlob(
  token: string,
  tenantId: string,
  channelId: string,
): Promise<Blob> {
  const response = await fetch(channelQrDownloadUrl(tenantId, channelId, "png"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(await errorMessageFromResponse(response));
  }
  return response.blob();
}

export async function createTenantUser(
  token: string,
  tenantId: string,
  payload: {
    email: string;
    display_name: string;
    password: string;
  },
): Promise<TenantUser> {
  return authenticatedFetch<TenantUser>(`/tenants/${tenantId}/users`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTenantUser(
  token: string,
  tenantId: string,
  userId: string,
  payload: {
    email?: string;
    display_name?: string;
    status?: "active" | "disabled" | "invited";
    role_code?: string;
    location_ids?: string[];
  },
): Promise<TenantUser> {
  return authenticatedFetch<TenantUser>(`/tenants/${tenantId}/users/${userId}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function updateRole(
  token: string,
  tenantId: string,
  roleId: string,
  payload: {
    name?: string;
    description?: string | null;
    permission_codes?: string[];
  },
): Promise<Role> {
  return authenticatedFetch<Role>(`/tenants/${tenantId}/roles/${roleId}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function createRole(
  token: string,
  tenantId: string,
  payload: {
    code: string;
    name: string;
    description?: string | null;
    permission_codes: string[];
  },
): Promise<Role> {
  return authenticatedFetch<Role>(`/tenants/${tenantId}/roles`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function assignTenantUserRole(
  token: string,
  tenantId: string,
  userId: string,
  payload: {
    role_code: string;
    scope: "tenant" | "location";
    location_id?: string;
  },
): Promise<TenantUser> {
  return authenticatedFetch<TenantUser>(`/tenants/${tenantId}/users/${userId}/roles`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTenantBranding(
  token: string,
  tenantId: string,
  payload: {
    logo_url?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    thank_you_text?: string;
  },
): Promise<TenantBranding> {
  return authenticatedFetch<TenantBranding>(`/tenants/${tenantId}/branding`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function patchTenantProfile(
  token: string,
  tenantId: string,
  payload: {
    name?: string;
    address_line1?: string | null;
    address_line2?: string | null;
    address_city?: string | null;
    address_state?: string | null;
    address_postal_code?: string | null;
  },
): Promise<Tenant> {
  return authenticatedFetch<Tenant>(`/tenants/${tenantId}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function uploadTenantBrandingLogoFile(
  token: string,
  tenantId: string,
  file: File,
): Promise<TenantBranding> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE_URL}/tenants/${tenantId}/branding/logo-file`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!response.ok) {
    throw new Error(await errorMessageFromResponse(response));
  }
  return response.json() as Promise<TenantBranding>;
}

export async function importTenantBrandingLogoFromUrl(
  token: string,
  tenantId: string,
  url: string,
): Promise<TenantBranding> {
  return authenticatedFetch<TenantBranding>(`/tenants/${tenantId}/branding/logo-import-url`, token, {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export async function fetchSurveyDetail(
  token: string,
  tenantId: string,
  surveyId: string,
): Promise<SurveyDetail> {
  return authenticatedFetch<SurveyDetail>(`/tenants/${tenantId}/surveys/${surveyId}`, token);
}

export async function addSurveyQuestion(
  token: string,
  tenantId: string,
  surveyId: string,
  payload: {
    question_key: string;
    question_type: QuestionType;
    prompt: string;
    help_text?: string;
    is_required: boolean;
    is_pii: boolean;
    sort_order: number;
    options: Array<{ value: string; label: string; sort_order: number }>;
  },
): Promise<SurveyQuestion> {
  return authenticatedFetch<SurveyQuestion>(`/tenants/${tenantId}/surveys/${surveyId}/questions`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSurveyQuestion(
  token: string,
  tenantId: string,
  surveyId: string,
  questionId: string,
  payload: {
    question_key: string;
    question_type: QuestionType;
    prompt: string;
    help_text?: string;
    is_required: boolean;
    is_pii: boolean;
    sort_order: number;
    options: Array<{ value: string; label: string; sort_order: number }>;
  },
): Promise<SurveyQuestion> {
  return authenticatedFetch<SurveyQuestion>(
    `/tenants/${tenantId}/surveys/${surveyId}/questions/${questionId}`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

/** Partial PATCH (e.g. sort_order-only) - omit unset fields. */
export async function patchSurveyQuestion(
  token: string,
  tenantId: string,
  surveyId: string,
  questionId: string,
  questionPatch: Record<string, unknown>,
): Promise<SurveyQuestion> {
  return authenticatedFetch<SurveyQuestion>(
    `/tenants/${tenantId}/surveys/${surveyId}/questions/${questionId}`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify(questionPatch),
    },
  );
}

export async function publishSurvey(
  token: string,
  tenantId: string,
  surveyId: string,
): Promise<SurveyVersion> {
  return authenticatedFetch<SurveyVersion>(`/tenants/${tenantId}/surveys/${surveyId}/publish`, token, {
    method: "POST",
  });
}
