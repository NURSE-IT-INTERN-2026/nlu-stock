"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface PageHeaderContextValue {
  // Extra label appended to the header breadcrumb (e.g. item code "ITM-001")
  detail: string | undefined;
  setDetail: (label: string | null) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue | null>(null);

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [detail, setDetailState] = useState<string | undefined>(undefined);
  const setDetail = useCallback((label: string | null) => {
    setDetailState(label ?? undefined);
  }, []);
  return (
    <PageHeaderContext.Provider value={{ detail, setDetail }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeader(): PageHeaderContextValue {
  const ctx = useContext(PageHeaderContext);
  // safe no-op when used outside provider
  if (!ctx) return { detail: undefined, setDetail: () => {} };
  return ctx;
}
