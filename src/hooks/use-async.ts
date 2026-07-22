"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useSyncExternalStore,
} from "react";

// ponytail: replaces @tanstack/react-query for the handful of dashboard/lookup fetches.
// Same shape the old useQuery consumers expect ({ data, isLoading, error, refetch }) but
// no cache, no dedup, no window-focus refetch — overkill for ~10 client-side GETs.
// In-flight concurrency guard mirrors usePagedList: ++reqId, drop stale resolutions.
export interface AsyncState<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [fetching, setFetching] = useState(true);
  const [nonce, setNonce] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    let cancelled = false;
    setFetching(true);
    fn()
      .then((d) => {
        if (cancelled || id !== reqId.current) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled || id !== reqId.current) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled && id === reqId.current) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  // isLoading mirrors react-query semantics: first load only (no data yet).
  // Refetch / dep change with data present keeps isLoading false so the UI doesn't
  // flash skeletons — it renders stale data until the fresh fetch resolves.
  return {
    data,
    isLoading: data === undefined && fetching,
    error,
    refetch,
  };
}

// Global refresh nonce: the dashboard "รีเฟรช" button bumps this; every dashboard hook
// reads it via useSyncExternalStore and folds it into useAsync deps → re-fetches together.
// Replaces queryClient.invalidateQueries({ queryKey: ["dashboard"] }).
let refreshNonce = 0;
const refreshSubs = new Set<() => void>();

export function refreshDashboard() {
  refreshNonce++;
  refreshSubs.forEach((s) => s());
}

function subscribeRefresh(cb: () => void) {
  refreshSubs.add(cb);
  return () => {
    refreshSubs.delete(cb);
  };
}

function getRefreshSnapshot() {
  return refreshNonce;
}

export function useDashboardRefreshNonce() {
  return useSyncExternalStore(subscribeRefresh, getRefreshSnapshot);
}
