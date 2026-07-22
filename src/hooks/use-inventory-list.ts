"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getItems } from "@/lib/api";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import type { FilterState } from "@/components/items/items-filter-bar";

const PER_PAGE = PAGE_SIZE.DEFAULT;

// Both transports are cursor-based (offset is banned). Desktop emulates numbered pages via a
// cursor stack; mobile appends on loadMore.
function buildParams(filter: FilterState, cursor: string | null): Record<string, string> {
  const p: Record<string, string> = { limit: String(PER_PAGE), mode: "cursor" };
  if (cursor) p.cursor = cursor;
  if (filter.query) p.search = filter.query;
  if (filter.profileId) p.profileId = filter.profileId;
  if (filter.categoryId) p.categoryId = filter.categoryId;
  if (filter.status.length) p.status = filter.status.join(",");
  if (filter.preset) p[filter.preset] = "true";
  if (filter.location.building) p.building = filter.location.building;
  if (filter.location.floor) p.floor = filter.location.floor;
  if (filter.location.room) p.room = filter.location.room;
  if (filter.location.detail) p.detail = filter.location.detail;
  return p;
}

export function useInventoryList<T>({
  isMobile,
  filter,
}: {
  isMobile: boolean;
  filter: FilterState;
}) {
  const mode: "pages" | "append" = isMobile ? "append" : "pages";

  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Mobile append cursor (next page to load).
  const [appendCursor, setAppendCursor] = useState<string | null>(null);

  // Desktop numbered pages: pageCursors[k] = cursor to ENTER page (k+1). pageCursors[0] = null (page 1).
  const [page, setPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<(string | null)[]>([null]);
  // latest-value ref so the async walk reads fresh cursors without stale closures.
  const pageCursorsRef = useRef(pageCursors);
  useEffect(() => {
    pageCursorsRef.current = pageCursors;
  }, [pageCursors]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // Primary fetch (replace): mode / filter / manual refetch → reset + first page.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const data = await getItems(buildParams(filter, null));
      if (cancelled) return;
      setItems((data.items || []) as T[]);
      if (data.total != null) setTotal(data.total);
      if (mode === "pages") {
        setPage(1);
        setPageCursors([null, ...(data.nextCursor ? [data.nextCursor] : [])]);
      } else {
        setAppendCursor(data.nextCursor ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, filter, reloadKey]);

  const goToPage = useCallback(
    async (target: number) => {
      if (mode !== "pages") return;
      const P = Math.max(1, Math.min(totalPages, target));
      setLoading(true);
      // ponytail: cursor can't jump — walk forward from the highest known page, caching each
      // cursor. prev / next / already-visited = 1 fetch; a far forward jump = N sequential fetches
      // (cursor's inherent cost). Switch desktop to offset if far jumps hurt UX.
      const cursors = [...pageCursorsRef.current];
      let eof = false;
      while (cursors.length < P) {
        const enter = cursors[cursors.length - 1]!;
        const step = await getItems(buildParams(filter, enter));
        if (!step.nextCursor) {
          eof = true; // ran out before reaching P — land on the last page
          break;
        }
        cursors.push(step.nextCursor);
      }
      setPageCursors(cursors);
      const finalPage = eof ? cursors.length : P;
      const data = await getItems(buildParams(filter, cursors[finalPage - 1] ?? null));
      setItems((data.items || []) as T[]);
      setPage(finalPage);
      if (data.total != null) setTotal(data.total);
      setLoading(false);
    },
    [mode, totalPages, filter]
  );

  const loadMore = useCallback(async () => {
    if (mode !== "append" || !appendCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    const data = await getItems(buildParams(filter, appendCursor));
    setItems((prev) => [...prev, ...((data.items || []) as T[])]);
    setAppendCursor(data.nextCursor ?? null);
    if (data.total != null) setTotal(data.total);
    setIsLoadingMore(false);
  }, [mode, appendCursor, isLoadingMore, filter]);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  return {
    items,
    total,
    page,
    perPage: PER_PAGE,
    totalPages,
    loading,
    isLoadingMore,
    hasNext: mode === "append" ? appendCursor !== null : page < totalPages,
    loadMore,
    setPage: goToPage,
    refetch,
  };
}
