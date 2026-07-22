"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Loader2,
} from "lucide-react";

// ponytail: one presentational component, two UI modes. Transport (offset / cursor / client-slice)
// lives in the consumer's hook — this never fetches. Numbered mode is identical for offset and
// cursor (both pass page/total/pageSize); loadMore is the mobile-append variant. Single height
// token (h-8) across every mode — no per-consumer h-7/h-8/h-9 drift.

const NUM_BTN = "hidden sm:inline-flex h-8 min-w-8 px-2 text-xs tabular-nums";
const NAV_BTN = "h-8 w-8";
const NAV_BTN_DESKTOP = "hidden sm:inline-flex h-8 w-8";

// Windowed page list: all when ≤7, otherwise 1 … (page-1..page+1) … last.
function windowed(page: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "ellipsis")[] = [1];
  if (page > 4) out.push("ellipsis");
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  for (let i = start; i <= end; i++) out.push(i);
  if (page < total - 3) out.push("ellipsis");
  out.push(total);
  return out;
}

type PaginationProps =
  | {
      mode?: "numbered";
      page: number;
      total: number;
      pageSize: number;
      onChange: (page: number) => void;
      loading?: boolean;
    }
  | {
      mode: "loadMore";
      shown: number;
      total: number;
      hasMore: boolean;
      isLoading: boolean;
      onLoadMore: () => void;
    };

export function Pagination(props: PaginationProps) {
  if (props.mode === "loadMore") {
    const { shown, total, hasMore, isLoading, onLoadMore } = props;
    return (
      <div className="flex flex-col items-center gap-2 border-t py-3">
        <Button
          variant="outline"
          className="w-full max-w-xs gap-2"
          disabled={!hasMore || isLoading}
          onClick={onLoadMore}
        >
          {isLoading && <Loader2 className="size-4 animate-spin" />}
          {hasMore ? "โหลดเพิ่มเติม" : "ไม่มีรายการเพิ่มเติม"}
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          แสดง {shown} จาก {total} รายการ
        </span>
      </div>
    );
  }

  const { page, total, pageSize, onChange, loading } = props;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const busy = !!loading;
  const pages = windowed(page, totalPages);

  const nav = (
    n: number,
    disabled: boolean,
    icon: ReactNode,
    label: string,
    className: string,
  ) => (
    <Button
      variant="ghost"
      className={className}
      disabled={disabled || busy}
      onClick={() => onChange(n)}
      aria-label={label}
    >
      {icon}
    </Button>
  );

  return (
    <nav className="border-t py-2" aria-label="Pagination">
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {nav(1, page === 1, <ChevronsLeft className="size-4" />, "First page", NAV_BTN_DESKTOP)}
        {nav(page - 1, page === 1, <ChevronLeft className="size-4" />, "Previous page", NAV_BTN)}
        {pages.map((p, i) =>
          p === "ellipsis" ? (
            <span key={`e${i}`} className="hidden sm:inline px-1 text-xs text-muted-foreground">…</span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "secondary" : "ghost"}
              className={NUM_BTN}
              disabled={busy}
              onClick={() => onChange(p)}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </Button>
          ),
        )}
        {/* mobile compact indicator (numbered buttons are sm:inline-flex above) */}
        <span className="sm:hidden px-2 text-xs tabular-nums text-muted-foreground whitespace-nowrap">
          {page} / {totalPages}
        </span>
        {nav(page + 1, page === totalPages, <ChevronRight className="size-4" />, "Next page", NAV_BTN)}
        {nav(totalPages, page === totalPages, <ChevronsRight className="size-4" />, "Last page", NAV_BTN_DESKTOP)}
      </div>
    </nav>
  );
}
