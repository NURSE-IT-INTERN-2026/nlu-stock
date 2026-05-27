"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

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

export function AlertProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<AlertCounts>(defaultCounts);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      if (res.ok) {
        const data = await res.json();
        setCounts(data);
      }
    } catch {
      // silent — will retry
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  return (
    <AlertContext.Provider value={counts}>
      {children}
    </AlertContext.Provider>
  );
}
