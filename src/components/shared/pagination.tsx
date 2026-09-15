"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

// ponytail: one presentational component, two UI modes. Transport (offset / cursor / client-slice)
// lives in the consumer's hook — this never fetches. Numbered mode is identical for offset and
// cursor (both pass page/total/pageSize); loadMore is the mobile-append variant. Single height
// token (h-8) across every mode — no per-consumer h-7/h-8/h-9 drift.
//
// Layout: total count on the left, one segmented button group on the right, sitting on a
// border-t inside the card/table it belongs to. It has no background of its own — dropping it
// outside a Card leaves it floating on the page wash, which is the look this replaced.

const NUM_BTN = "hidden sm:inline-flex h-8 min-w-9 rounded-none px-2 text-xs tabular-nums";
const NAV_BTN = "h-8 rounded-none px-2.5 text-xs";

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
      /** หน่วยนับฝั่งซ้าย — "รายการ" (ค่าเริ่มต้น) / "ครั้ง" */
      unit?: string;
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

  const { page, total, pageSize, onChange, loading, unit = "รายการ" } = props;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const busy = !!loading;
  const pages = windowed(page, totalPages);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3"
      aria-label="เลขหน้า"
    >
      <span className="text-sm text-muted-foreground tabular-nums">
        รายการทั้งหมด {total.toLocaleString("th-TH")} {unit}
      </span>

      {/* หนึ่งกล่อง segmented. เส้นคั่นต้องตั้ง "สี" ด้วย ไม่ใช่แค่ความหนา: buttonVariants base มี
          border-transparent ติดมาทุกปุ่ม และ divide-x คอมไพล์เป็น :where(...) ที่ specificity = 0
          จึงแพ้ — ได้เส้นเฉพาะ span "…" ที่ไม่มี class สี. border-l-border ทับ border-transparent
          ได้เพราะ arbitrary variant เรียงท้าย utilities layer (specificity เท่ากัน ตัวหลังชนะ). */}
      <div className="inline-flex items-center rounded-md border overflow-hidden [&>*+*]:border-l [&>*+*]:border-l-border">
        <Button
          variant="ghost"
          className={NAV_BTN}
          disabled={page === 1 || busy}
          onClick={() => onChange(page - 1)}
          aria-label="หน้าก่อนหน้า"
        >
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">ก่อนหน้า</span>
        </Button>

        {pages.map((p, i) =>
          p === "ellipsis" ? (
            <span
              key={`e${i}`}
              className="hidden sm:flex h-8 min-w-9 items-center justify-center text-xs text-muted-foreground"
            >
              …
            </span>
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

        {/* จอเล็กแสดงตัวเลขย่อแทนปุ่มหน้า */}
        <span className="sm:hidden flex h-8 items-center px-3 text-xs tabular-nums text-muted-foreground whitespace-nowrap">
          {page} / {totalPages}
        </span>

        <Button
          variant="ghost"
          className={NAV_BTN}
          disabled={page === totalPages || busy}
          onClick={() => onChange(page + 1)}
          aria-label="หน้าถัดไป"
        >
          <span className="hidden sm:inline">ถัดไป</span>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
