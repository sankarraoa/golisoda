import type { MeResponse, TokenResponse } from "../types/admin";

const PLATFORM_ACCESS_TOKEN_KEY = "goliSoda.platform.accessToken";
const PLATFORM_REFRESH_TOKEN_KEY = "goliSoda.platform.refreshToken";

const PLATFORM_API_BASE_URL =
  import.meta.env.VITE_PLATFORM_API_BASE_URL ?? "http://localhost:8003";

type ApiValidationError = {
  loc?: Array<string | number>;
  msg?: string;
};

export type SuperAdminUser = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type PlatformTenant = {
  id: string;
  name: string;
  slug: string;
  default_locale: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export function getStoredPlatformAccessToken(): string | null {
  return window.localStorage.getItem(PLATFORM_ACCESS_TOKEN_KEY);
}

export function storePlatformTokens(tokens: TokenResponse): void {
  window.localStorage.setItem(PLATFORM_ACCESS_TOKEN_KEY, tokens.access_token);
  window.localStorage.setItem(PLATFORM_REFRESH_TOKEN_KEY, tokens.refresh_token);
}

export function clearPlatformTokens(): void {
  window.localStorage.removeItem(PLATFORM_ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(PLATFORM_REFRESH_TOKEN_KEY);
}

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
    return "Request failed.";
  }
  return "Request failed.";
}

export async function platformLogin(email: string, password: string): Promise<TokenResponse> {
  const response = await fetch(`${PLATFORM_API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error((await errorMessageFromResponse(response)) || "Invalid email or password.");
  }
  return response.json();
}

export async function platformFetchMe(token: string): Promise<MeResponse> {
  const response = await fetch(`${PLATFORM_API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(await errorMessageFromResponse(response));
  }
  return response.json();
}

async function platformAuthFetch<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${PLATFORM_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.status === 401) {
    clearPlatformTokens();
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (!response.ok) {
    throw new Error(await errorMessageFromResponse(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

export async function listPlatformSuperAdmins(token: string): Promise<SuperAdminUser[]> {
  return platformAuthFetch<SuperAdminUser[]>("/platform/super-admin-users", token);
}

export async function createPlatformSuperAdmin(
  token: string,
  payload: { email: string; display_name: string; password: string },
): Promise<SuperAdminUser> {
  return platformAuthFetch<SuperAdminUser>("/platform/super-admin-users", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listPlatformTenants(token: string): Promise<PlatformTenant[]> {
  return platformAuthFetch<PlatformTenant[]>("/platform/tenants", token);
}

export async function createPlatformTenant(
  token: string,
  payload: {
    name: string;
    slug: string;
    default_locale: string;
    tenant_admin_email: string;
    tenant_admin_display_name?: string | null;
  },
): Promise<PlatformTenant> {
  return platformAuthFetch<PlatformTenant>("/platform/tenants", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Initial password provisioned for the tenant administrator (platform onboarding). */
export const TENANT_ADMIN_DEFAULT_PASSWORD = "test1234";
