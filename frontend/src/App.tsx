import { useCallback, useState } from "react";

import { getStoredAccessToken } from "./lib/adminApi";
import { isPlatformAdminSite } from "./lib/runtimePublicEnv";
import { PlatformApp } from "./platform/PlatformApp";
import { LoginPage } from "./pages/admin/LoginPage";
import { TenantDashboardPage } from "./pages/admin/TenantDashboardPage";
import { PublicFeedbackPage } from "./pages/public/PublicFeedbackPage";

export function App() {
  const [sessionVersion, setSessionVersion] = useState(0);
  const path = window.location.pathname;
  const hasAccessToken = Boolean(getStoredAccessToken());

  const refreshSession = useCallback(() => {
    setSessionVersion((currentVersion) => currentVersion + 1);
  }, []);

  if (path.startsWith("/f/")) {
    return <PublicFeedbackPage />;
  }

  if (isPlatformAdminSite()) {
    return <PlatformApp />;
  }

  if (path === "/platform" || path.startsWith("/platform/")) {
    return <PlatformApp />;
  }

  if (!hasAccessToken) {
    return <LoginPage key={sessionVersion} onSignedIn={refreshSession} />;
  }

  return <TenantDashboardPage key={sessionVersion} onSignedOut={refreshSession} />;
}
