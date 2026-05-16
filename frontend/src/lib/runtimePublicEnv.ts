/**
 * Optional overrides loaded from `/runtime-env.js` before the app bundle runs.
 * Railway can expose `VITE_*` only at container runtime; `scripts/write-runtime-env.mjs`
 * regenerates that file from `process.env` before `vite preview`.
 */
export type GoliRuntimePublicEnv = {
  VITE_API_BASE_URL?: string;
  VITE_TEMPLATE_API_BASE_URL?: string;
  VITE_PUBLIC_FEEDBACK_API_URL?: string;
  VITE_PLATFORM_API_BASE_URL?: string;
  /** Hostname only (e.g. admin.example.com). That host serves PlatformApp at `/`. */
  VITE_PLATFORM_ADMIN_HOSTNAME?: string;
};

declare global {
  interface Window {
    __GOLI_RUNTIME_ENV__?: GoliRuntimePublicEnv;
  }
}

export function readRuntimePublicEnv(): GoliRuntimePublicEnv {
  if (typeof window === "undefined") {
    return {};
  }
  return window.__GOLI_RUNTIME_ENV__ ?? {};
}

/**
 * Hostname only, lowercase. Strips accidental quotes (common in pasted env) and `https://host` forms.
 */
export function normalizePlatformAdminHostname(raw: string | undefined | null): string {
  if (raw == null) {
    return "";
  }
  let s = String(raw).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  if (!s) {
    return "";
  }
  if (s.includes("://")) {
    try {
      return new URL(s).hostname.toLowerCase();
    } catch {
      return "";
    }
  }
  const slash = s.indexOf("/");
  if (slash !== -1) {
    s = s.slice(0, slash).trim();
  }
  return s.toLowerCase();
}

/** Resolves configured platform-admin hostname (runtime-env, meta, build-time env). */
export function readPlatformAdminHostnameConfigured(): string {
  if (typeof window === "undefined") {
    return "";
  }
  const fromMeta =
    document.querySelector('meta[name="goli-platform-admin-hostname"]')?.getAttribute("content")?.trim() ?? "";
  const raw =
    readRuntimePublicEnv().VITE_PLATFORM_ADMIN_HOSTNAME ||
    fromMeta ||
    import.meta.env.VITE_PLATFORM_ADMIN_HOSTNAME ||
    "";
  return normalizePlatformAdminHostname(raw);
}

/** True when this browser tab is on the dedicated platform-admin host (e.g. admin.example.com). */
export function isPlatformAdminSite(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const want = readPlatformAdminHostnameConfigured();
  return Boolean(want && window.location.hostname.toLowerCase() === want);
}

function normalizeBase(url: string): string {
  return url.replace(/\/$/, "");
}

function metaTagContent(metaName: string): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }
  const raw = document.querySelector(`meta[name="${metaName}"]`)?.getAttribute("content");
  const v = raw?.trim();
  return v || undefined;
}

export type ResolvePublicEnvUrlOptions = {
  /** Reads `<meta name="..."> content` after runtime JS, before build-time env (see write-runtime-env.mjs). */
  metaName?: string;
};

/** Prefer runtime injection, optional meta tag, Vite build-time env, then fallback. */
export function resolvePublicEnvUrl(
  key: keyof GoliRuntimePublicEnv,
  baked: string | undefined,
  fallback: string | (() => string),
  options?: ResolvePublicEnvUrlOptions,
): string {
  const rt = readRuntimePublicEnv()[key]?.trim();
  if (rt) {
    return normalizeBase(rt);
  }
  const metaName = options?.metaName;
  if (metaName) {
    const fromMeta = metaTagContent(metaName);
    if (fromMeta) {
      return normalizeBase(fromMeta);
    }
  }
  const fromBuild = baked?.trim();
  if (fromBuild) {
    return normalizeBase(fromBuild);
  }
  const fb = typeof fallback === "function" ? fallback() : fallback;
  return normalizeBase(fb);
}
