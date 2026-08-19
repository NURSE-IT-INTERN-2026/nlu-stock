"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DashboardScope } from "@/lib/dashboard-scope";

// The widgets never take a scope prop. They sit inside whichever tab panel is mounted and
// read the scope from context, so adding a widget to a tab is one line and nothing has to
// thread props through the panels.
const DashboardScopeContext = createContext<DashboardScope>({ kind: "consume" });

export function DashboardScopeProvider({ scope, children }: { scope: DashboardScope; children: ReactNode }) {
  return <DashboardScopeContext.Provider value={scope}>{children}</DashboardScopeContext.Provider>;
}

export function useDashboardScope() {
  return useContext(DashboardScopeContext);
}
