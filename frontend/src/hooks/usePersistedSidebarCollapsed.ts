import { useCallback, useEffect, useState } from "react";

function readCollapsed(storageKey: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(storageKey: string, collapsed: boolean): void {
  try {
    window.localStorage.setItem(storageKey, collapsed ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

export function usePersistedSidebarCollapsed(storageKey: string) {
  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed(storageKey));

  useEffect(() => {
    writeCollapsed(storageKey, collapsed);
  }, [collapsed, storageKey]);

  const toggle = useCallback(() => {
    setCollapsed((v) => !v);
  }, []);

  return { collapsed, setCollapsed, toggle };
}

export const PLATFORM_SIDEBAR_STORAGE_KEY = "goliSoda.sidebarCollapsed.platform";
export const TENANT_SIDEBAR_STORAGE_KEY = "goliSoda.sidebarCollapsed.tenant";
