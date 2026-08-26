"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Pagination } from "@/components/shared/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { FLOW, SectionTitle, type FlowTone } from "./primitives";
import { cn } from "@/lib/utils";

export interface MoveRow {
  id: string;
  itemId: string;
  date: string;
  name: string;
  code: string;
  /** Free-form third fact — ประเภทการใช้งาน on เบิก, empty on รับเข้า. */
  kind?: string;
  qty: number;
  who: string;
}

/**
 * เบิกล่าสุด and รับเข้าล่าสุด were two ~100-line files differing in one column and a
 * heading. One table now serves both: the caller maps its records to MoveRow.
 *
 * Two layouts, because a four-column table does not survive a phone. Below sm the rows
 * stack (name over a date · who · kind line) instead of scrolling sideways; from sm up it
 * is a dense fixed table.
 */
export function MoveTable({
  title,
  rows,
  tone,
  whoLabel,
  emptyText = "ไม่มีรายการ",
}: {
  title: string;
  rows: MoveRow[];
  tone: FlowTone;
  whoLabel: string;
  emptyText?: string;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const bodyRef = useRef<HTMLDivElement>(null);

  const sliced = rows.slice((page - 1) * PAGE_SIZE.DASHBOARD, page * PAGE_SIZE.DASHBOARD);
  const qtyCls = cn("font-bold tabular-nums", FLOW[tone].text);

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
    bodyRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const go = useCallback((itemId: string) => router.push(`/items/${itemId}`), [router]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, itemId: string) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go(itemId);
      }
    },
    [go],
  );

  return (
    <section className="animate-rise flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-lg shadow-black/[0.04]">
      <div className="border-b bg-secondary/40 px-4 py-3">
        <SectionTitle title={title} />
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div ref={bodyRef} className="flex flex-1 flex-col">
          {/* mobile: stacked rows, no horizontal scroll */}
          <ul className="divide-y sm:hidden">
            {sliced.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => go(r.itemId)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-4 py-2.5 text-left transition-colors active:bg-secondary/40"
                  aria-label={`${r.code} ${r.name}, ${r.qty} ชิ้น`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{r.name}</span>
                    <span className="mt-0.5 block truncate text-[11px] tabular-nums text-muted-foreground">
                      {[r.date, r.who, r.kind].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className={cn("shrink-0 text-sm", qtyCls)}>{r.qty}</span>
                </button>
              </li>
            ))}
          </ul>

          {/* desktop: dense fixed table */}
          <div className="hidden flex-1 sm:block">
            <Table grid zebra className="table-fixed">
              <TableHeader>
                <TableRow className="bg-secondary/40">
                  <TableHead className="w-[104px]">วันที่</TableHead>
                  <TableHead>รายการ</TableHead>
                  <TableHead className="w-[64px] text-right">จำนวน</TableHead>
                  <TableHead className="w-[112px]">{whoLabel}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sliced.map((r) => (
                  <TableRow
                    key={r.id}
                    tabIndex={0}
                    onClick={() => go(r.itemId)}
                    onKeyDown={(e) => onKeyDown(e, r.itemId)}
                    aria-label={`${r.code} ${r.name}, ${r.qty} ชิ้น`}
                    className="cursor-pointer focus-visible:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <TableCell className="text-[11px] tabular-nums text-muted-foreground">
                      {r.date}
                    </TableCell>
                    <TableCell className="h-auto py-1.5">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {[r.code, r.kind].filter(Boolean).join(" · ")}
                      </p>
                    </TableCell>
                    <TableCell className={cn("text-right", qtyCls)}>{r.qty}</TableCell>
                    <TableCell className="truncate text-xs text-muted-foreground">{r.who}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-auto">
            <Pagination page={page} total={rows.length} pageSize={PAGE_SIZE.DASHBOARD} onChange={handlePageChange} />
          </div>
        </div>
      )}
    </section>
  );
}
