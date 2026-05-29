"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";

interface AlertCounts {
  lowStock: number;
  nearExpiry: number;
  overdueMaintenance: number;
  total: number;
}

const defaultCounts: AlertCounts = { lowStock: 0, nearExpiry: 0, overdueMaintenance: 0, total: 0 };

const AlertContext = createContext<AlertCounts>(defaultCounts);

export function useAlerts() {
  return useContext(AlertContext);
}

function countsEqual(a: AlertCounts, b: AlertCounts) {
  return a.lowStock === b.lowStock && a.nearExpiry === b.nearExpiry && a.overdueMaintenance === b.overdueMaintenance && a.total === b.total;
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<AlertCounts>(defaultCounts);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      if (res.ok) {
        const data: AlertCounts = await res.json();
        setCounts((prev) => countsEqual(prev, data) ? prev : data);
      }
    } catch {
      // silent — will retry
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const value = useMemo(() => counts, [counts]);

  return (
    <AlertContext.Provider value={value}>
      {children}
    </AlertContext.Provider>
  );
}
