import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { readRuntimePublicEnv, normalizePlatformAdminHostname } from "./lib/runtimePublicEnv";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/admin.css";
import "./styles/public-feedback.css";
import "./styles/public-feedback-kiosk.css";
import "./styles/public-feedback-heritage.css";
import "./styles/public-feedback-jewelry-card.css";
import "./styles/public-feedback-phone-portrait.css";

/**
 * When the platform admin hostname hits this SPA, send `/` → `/platform` (superadmin).
 * Set `VITE_PLATFORM_ADMIN_HOSTNAME` or `PLATFORM_ADMIN_HOSTNAME` on the frontend service
 * (e.g. `admin.golisoda.app`; no `https://`). Runtime `runtime-env.js` and/or
 * `<meta name="goli-platform-admin-hostname">` are filled at container start.
 */
function platformAdminHostnameFromMeta(): string {
  if (typeof document === "undefined") {
    return "";
  }
  const raw = document.querySelector('meta[name="goli-platform-admin-hostname"]')?.getAttribute("content");
  return raw?.trim() ?? "";
}

function redirectPlatformAdminRootToPlatform(): void {
  if (typeof window === "undefined") {
    return;
  }
  const rawConfigured =
    readRuntimePublicEnv().VITE_PLATFORM_ADMIN_HOSTNAME ||
    platformAdminHostnameFromMeta() ||
    import.meta.env.VITE_PLATFORM_ADMIN_HOSTNAME ||
    "";
  const want = normalizePlatformAdminHostname(rawConfigured);
  if (!want) {
    return;
  }
  const host = window.location.hostname.toLowerCase();
  const path = window.location.pathname || "/";
  const isRootPath = path === "/" || path === "" || path === "/index.html";
  if (host === want && isRootPath) {
    window.location.replace(`${window.location.origin}/platform`);
  }
}

redirectPlatformAdminRootToPlatform();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
