import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { isPlatformAdminSite } from "./lib/runtimePublicEnv";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/admin.css";
import "./styles/public-feedback.css";
import "./styles/public-feedback-kiosk.css";
import "./styles/public-feedback-heritage.css";
import "./styles/public-feedback-jewelry-card.css";
import "./styles/public-feedback-phone-portrait.css";

/**
 * On the platform-admin host, `/platform` is legacy; normalize to `/` so the URL stays `admin.*` only.
 */
function normalizePlatformAdminPathname(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!isPlatformAdminSite()) {
    return;
  }
  const path = window.location.pathname || "/";
  if (path === "/platform" || path.startsWith("/platform/")) {
    window.location.replace(`${window.location.origin}/`);
  }
}

normalizePlatformAdminPathname();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
