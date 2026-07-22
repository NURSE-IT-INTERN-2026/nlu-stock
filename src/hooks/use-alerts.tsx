"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { getAlerts } from "@/lib/api";

interface AlertCounts {
  lowStock: number;
  nearExpiry: number;
  overdueMaintenance: number;
  overdueReturn: number;
  damagedPending: number;
  dueCount: number;
  total: number;
  totalItems: number;
  onLoan: number;
}

// `loaded` flips true after the first successful fetch — lets consumers tell "still
// loading" (counts default to 0) apart from "loaded and genuinely zero".
interface AlertState extends AlertCounts {
  loaded: boolean;
}

const defaultState: AlertState = { lowStock: 0, nearExpiry: 0, overdueMaintenance: 0, overdueReturn: 0, damagedPending: 0, dueCount: 0, total: 0, totalItems: 0, onLoan: 0, loaded: false };

const AlertContext = createContext<AlertState>(defaultState);

export function useAlerts() {
  return useContext(AlertContext);
}

function countsEqual(a: AlertCounts, b: AlertCounts) {
  return a.lowStock === b.lowStock && a.nearExpiry === b.nearExpiry && a.overdueMaintenance === b.overdueMaintenance && a.overdueReturn === b.overdueReturn && a.damagedPending === b.damagedPending && a.dueCount === b.dueCount && a.total === b.total && a.totalItems === b.totalItems && a.onLoan === b.onLoan;
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AlertState>(defaultState);

  const fetchAlerts = useCallback(async () => {
    try {
      const data: AlertCounts = await getAlerts();
      setState((prev) => {
        if (prev.loaded && countsEqual(prev, data)) return prev;
        return { ...data, loaded: true };
      });
    } catch {
      // silent — will retry
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const value = useMemo(() => state, [state]);

  return (
    <AlertContext.Provider value={value}>
      {children}
    </AlertContext.Provider>
  );
}
