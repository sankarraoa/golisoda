import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

export type AuditTrailScopeApi = {
  setDetailResourceId: (id: string | null) => void;
};

const AuditTrailScope = createContext<AuditTrailScopeApi | null>(null);

export function AuditTrailScopeProvider({
  activeViewKey,
  setDetailResourceId,
  children,
}: {
  activeViewKey: string;
  setDetailResourceId: (id: string | null) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    setDetailResourceId(null);
  }, [activeViewKey, setDetailResourceId]);
  const value = useMemo(() => ({ setDetailResourceId }), [setDetailResourceId]);
  return <AuditTrailScope.Provider value={value}>{children}</AuditTrailScope.Provider>;
}

export function useOptionalAuditTrailScope(): AuditTrailScopeApi | null {
  return useContext(AuditTrailScope);
}
