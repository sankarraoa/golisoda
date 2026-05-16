/**
 * Writes dist/runtime-env.js from process.env so production preview can override
 * API URLs without rebuilding (Railpack/build-cache friendly).
 *
 * Also patches dist/index.html `<meta name="goli-api-base">` so the admin SPA can
 * resolve the API URL even when only non-VITE_* variables exist on Railway.
 * Patches `<meta name="goli-platform-admin-hostname">` the same way when set.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const KEY_GROUPS = [
  {
    outKey: "VITE_API_BASE_URL",
    envNames: ["VITE_API_BASE_URL", "API_BASE_URL", "PUBLIC_API_URL", "GOLI_API_BASE_URL"],
  },
  {
    outKey: "VITE_TEMPLATE_API_BASE_URL",
    envNames: ["VITE_TEMPLATE_API_BASE_URL", "TEMPLATE_API_BASE_URL"],
  },
  {
    outKey: "VITE_PUBLIC_FEEDBACK_API_URL",
    envNames: ["VITE_PUBLIC_FEEDBACK_API_URL", "PUBLIC_FEEDBACK_API_URL"],
  },
  {
    outKey: "VITE_PLATFORM_API_BASE_URL",
    envNames: ["VITE_PLATFORM_API_BASE_URL", "PLATFORM_API_BASE_URL", "GOLI_PLATFORM_API_BASE_URL"],
  },
  {
    outKey: "VITE_PLATFORM_ADMIN_HOSTNAME",
    envNames: [
      "VITE_PLATFORM_ADMIN_HOSTNAME",
      "PLATFORM_ADMIN_HOSTNAME",
      "GOLI_PLATFORM_ADMIN_HOSTNAME",
    ],
  },
];

function firstNonEmpty(names) {
  for (const n of names) {
    const raw = process.env[n];
    if (typeof raw === "string" && raw.trim() !== "") {
      return raw.trim();
    }
  }
  return "";
}

/** Match browser-side `normalizePlatformAdminHostname` (quotes, https://, trailing path). */
function normalizePlatformAdminHostname(raw) {
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

function escapeHtmlAttr(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function resolveDistDir() {
  const cwdDist = join(process.cwd(), "dist");
  const pkgDist = join(__dirname, "..", "dist");
  if (existsSync(cwdDist)) {
    return cwdDist;
  }
  if (existsSync(pkgDist)) {
    return pkgDist;
  }
  return null;
}

const distDir = resolveDistDir();

if (!distDir) {
  console.warn(
    "[write-runtime-env] dist/ not found under cwd or package root — skipping (run vite build first).",
  );
  process.exit(0);
}

const env = {};
for (const group of KEY_GROUPS) {
  let v = firstNonEmpty(group.envNames);
  if (v && group.outKey === "VITE_PLATFORM_ADMIN_HOSTNAME") {
    v = normalizePlatformAdminHostname(v);
  }
  if (v) {
    env[group.outKey] = v;
  }
}

const serialized = JSON.stringify(env);
const body = `window.__GOLI_RUNTIME_ENV__=Object.assign({},window.__GOLI_RUNTIME_ENV__||{},${serialized});`;

const outFile = join(distDir, "runtime-env.js");
writeFileSync(outFile, body, "utf8");

const apiUrl = env.VITE_API_BASE_URL ?? "";
const platformAdminHost = env.VITE_PLATFORM_ADMIN_HOSTNAME ?? "";
const indexHtmlPath = join(distDir, "index.html");
if (existsSync(indexHtmlPath)) {
  let html = readFileSync(indexHtmlPath, "utf8");
  if (apiUrl) {
    html = html.replace(
      /<meta\s+name="goli-api-base"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="goli-api-base" content="${escapeHtmlAttr(apiUrl)}" />`,
    );
  }
  const platformMetaRe =
    /<meta\s+name="goli-platform-admin-hostname"\s+content="[^"]*"\s*\/?>/i;
  if (platformMetaRe.test(html)) {
    html = html.replace(
      platformMetaRe,
      `<meta name="goli-platform-admin-hostname" content="${escapeHtmlAttr(platformAdminHost)}" />`,
    );
  } else if (platformAdminHost) {
    const injected = `<meta name="goli-platform-admin-hostname" content="${escapeHtmlAttr(platformAdminHost)}" />`;
    if (/<meta\s+name="goli-api-base"/i.test(html)) {
      html = html.replace(
        /(<meta\s+name="goli-api-base"\s+content="[^"]*"\s*\/?>)/i,
        `$1\n    ${injected}`,
      );
    } else {
      html = html.replace(/(<meta\s+name="viewport"[^>]*>)/i, `$1\n    ${injected}`);
    }
  }
  writeFileSync(indexHtmlPath, html, "utf8");
}

if (!apiUrl) {
  console.warn(
    "[write-runtime-env] No tenant API URL found. Set VITE_API_BASE_URL or API_BASE_URL on this Railway service (Frontend). Login will fall back to http://localhost:8000.",
  );
}

if (process.env.RAILWAY_ENVIRONMENT && !env.VITE_PLATFORM_ADMIN_HOSTNAME) {
  console.warn(
    "[write-runtime-env] PLATFORM_ADMIN_HOSTNAME (or VITE_* / GOLI_* alias) not visible in process.env at preview start — admin console must use hostname-based routing (set the hostname or use /platform on localhost).",
  );
}
