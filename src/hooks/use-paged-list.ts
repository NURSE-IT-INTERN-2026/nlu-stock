"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ponytail: offset transport, abstracted over a fetchPage(page) → {items,total} callback.
// Desktop = numbered (replace page N); mobile = loadMore (accumulate pages 1..N).
// Cursor lists (items) keep useInventoryList — cursor can't jump, so it owns its own walk.
// Multi-source merges (alerts/history) are offset by design; this hook is what makes them
// loadMore on mobile without each page re-implementing the accumulate/replace switch.
export function usePagedList<T>({
  fetchPage,
  pageSize,
  isMobile,
}: {
  fetchPage: (page: number) => Promise<{ items: T[]; total: number }>;
  pageSize: number;
  isMobile: boolean;
}) {
  const mode: "pages" | "append" = isMobile ? "append" : "pages";

  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Concurrency guard: each fetch (reset / goToPage / loadMore) takes a unique id by ++ing the ref.
  // After its await, if reqId.current has moved on (a newer fetch started — e.g. filter changed
  // mid-loadMore), the stale result is dropped so old-filter rows can't append to a new-filter list.
  // A superseded fetch leaves the loading flags alone — the newer fetch owns them. Reset additionally
  // clears isLoadingMore because it restarts at page 1, and mode guarantees loadMore is only ever
  // superseded by reset or another loadMore (both manage isLoadingMore), so the spinner never sticks.
  const reqId = useRef(0);

  // Reset + first page whenever the fetch changes (filter) or the viewport crosses the breakpoint.
  useEffect(() => {
    const id = ++reqId.current;
    let cancelled = false;
    setLoading(true);
    setIsLoadingMore(false);
    (async () => {
      try {
        const data = await fetchPage(1);
        if (cancelled || id !== reqId.current) return;
        setItems(data.items);
        setTotal(data.total);
        setPage(1);
      } finally {
        if (!cancelled && id === reqId.current) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage, mode, reloadKey]);

  const goToPage = useCallback(
    async (target: number) => {
      if (mode !== "pages") return;
      const id = ++reqId.current;
      setLoading(true);
      try {
        let p = target;
        let data = await fetchPage(p);
        if (id !== reqId.current) return;
        // `totalPages` ที่ถืออยู่เป็นของก่อนคำขอนี้ จึงกันหน้าที่เพิ่งหายไปไม่ได้: ลบแถวสุดท้าย
        // ของหน้าสุดท้ายแล้ว refetch จะขอหน้าที่ไม่มีอยู่แล้ว และได้ตารางว่างทั้งที่ของยังอยู่
        // หน้าก่อนหน้า. total ที่เพิ่งกลับมาคือตัวเดียวที่รู้ความจริง — ถอยไปหน้าสุดท้ายจริงแทน.
        const last = Math.max(1, Math.ceil(data.total / pageSize));
        if (p > last) {
          p = last;
          data = await fetchPage(p);
          if (id !== reqId.current) return;
        }
        setItems(data.items);
        setTotal(data.total);
        setPage(p);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [mode, fetchPage, pageSize],
  );

  const loadMore = useCallback(async () => {
    if (mode !== "append" || isLoadingMore) return;
    const totalPages = Math.ceil(total / pageSize);
    const next = page + 1;
    if (next > totalPages) return;
    const id = ++reqId.current;
    setIsLoadingMore(true);
    try {
      const data = await fetchPage(next);
      if (id !== reqId.current) return;
      setItems((prev) => [...prev, ...data.items]);
      setTotal(data.total);
      setPage(next);
    } finally {
      if (id === reqId.current) setIsLoadingMore(false);
    }
  }, [mode, page, total, pageSize, isLoadingMore, fetchPage]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    loading,
    isLoadingMore,
    hasNext: page < totalPages,
    loadMore,
    setPage: goToPage,
    // refetch = "reload what's on screen", not "start over". Filling in missing prices on
    // นำเข้าคลัง saves row after row deep in the ledger, and a page-1 reset per save loses the
    // user's place. goToPage carries the same reqId guard, so a stale reply still can't win,
    // and it clamps to the last page that survived — a delete that empties the page you are
    // standing on lands you on the new last one, not on an empty table.
    // append (mobile) holds pages 1..N stacked — re-fetching one of them would drop the rest,
    // so that mode keeps the page-1 reset.
    refetch: () => {
      if (mode === "pages") void goToPage(page);
      else setReloadKey((k) => k + 1);
    },
  };
}
