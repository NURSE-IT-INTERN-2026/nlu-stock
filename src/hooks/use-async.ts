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
  /** True for EVERY in-flight fetch, including refetches that already have data.
   *  Report tabs need this: `isLoading` keeps the previous filter's numbers on screen under
   *  the new filter's heading, which on a report reads as an answer rather than a stale view. */
  isFetching: boolean;
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
    isFetching: fetching,
    error,
    refetch,
  };
}

// Global refresh nonces: a counter every interested hook folds into its useAsync deps, so
// one bump re-fetches all of them together. Replaces queryClient.invalidateQueries().
// subscribe/snapshot are created once per store — a fresh closure each render would make
// useSyncExternalStore re-subscribe on every render.
function createNonceStore() {
  let nonce = 0;
  const subs = new Set<() => void>();
  const subscribe = (cb: () => void) => {
    subs.add(cb);
    return () => {
      subs.delete(cb);
    };
  };
  const snapshot = () => nonce;
  return {
    bump() {
      nonce++;
      subs.forEach((s) => s());
    },
    // snapshot doubles as getServerSnapshot: 0 on the server, and the first client render
    // matches because nothing can have bumped it before hydration.
    useNonce: () => useSyncExternalStore(subscribe, snapshot, snapshot),
  };
}

// ทุกอย่างในหน้าแดชบอร์ด — ปุ่ม "รีเฟรช" เป็นคนกด
const dashboardStore = createNonceStore();
export const refreshDashboard = dashboardStore.bump;
export const useDashboardRefreshNonce = dashboardStore.useNonce;

// ข้อมูลตั้งต้นที่แก้ได้จากหน้าตั้งค่า: ประเภท หมวดหมู่ สถานที่ หน่วยนับ. แยกจากแดชบอร์ดเพราะ
// คนละจังหวะกัน — ตัวนี้ถูกกดโดยการบันทึกของผู้ใช้ ไม่ใช่ปุ่มรีเฟรช
//
// ที่ต้องมี: tab ทั้งเจ็ดของหน้าตั้งค่าถูก mount ค้างพร้อมกันหมด (settings/page.tsx ซ่อนด้วย
// class ไม่ได้ unmount) และ dialog แก้พัสดุก็ mount ค้างทั้งที่ยังไม่เปิด — fetch ที่ยิงครั้งเดียว
// ตอน mount จึงไม่มีวันเห็นสิ่งที่ tab ข้างๆ เพิ่งบันทึกไป
const lookupStore = createNonceStore();
export const refreshLookups = lookupStore.bump;
export const useLookupNonce = lookupStore.useNonce;
