"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { cn } from "@/lib/utils";
import { tokenTint, type Token } from "./report-kit";
import { EmptyState } from "@/components/shared/empty-state";

// TableCell เป็น whitespace-nowrap ทั้งแอป ซึ่งถูกกับคอลัมน์ที่ขาดกลางคำไม่ได้ — วันที่, รหัส,
// ตัวเลข — แต่ชื่อพัสดุจริงในคลังยาวถึง 65 ตัวอักษร ("อุปกรณ์ให้ออกซิเจนสำหรับผู้ใหญ่ชนิดมีชุดพ่นยา
// oxygen nebulizer with mask adult") = เซลล์เดียวกว้าง ~450px แล้วตารางเก้าคอลัมน์ทะลุ 1400px
// บนจอที่กว้าง 390px. ปล่อยคอลัมน์ที่เป็นประโยคให้ห่อบรรทัด แล้ว auto table layout จะหดมันลงหา
// min-content เองเมื่อจอแคบ ส่วน min-w กันไม่ให้หดจนเหลือคำละบรรทัด. กติกาเดียวกับตารางเคสที่
// src/components/cases/case-workspace.tsx
export const wrapText = "min-w-[200px] whitespace-normal";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface ReportDataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  pageSize?: number;
  emptyMessage?: string;
  /** บรรทัดรองใต้ emptyMessage — ใส่เมื่อมีอะไรให้ผู้ใช้ทำต่อจริงๆ */
  emptyDescription?: string;
  /** Optional — makes each row a button opening a detail view. Desktop + mobile alike. */
  onRowClick?: (row: T) => void;
  /** Tints the header with the section's event colour. Omit for the plain header. */
  token?: Token;
  /** Server-paged callers pass their own <Pagination/> here so it renders inside the Card
      instead of floating on the page wash below it. Replaces the client-side pager. */
  footer?: React.ReactNode;
  /** Override the table's own card chrome when it is nested inside a bigger card. */
  className?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ReportDataTable<T extends Record<string, any>>({
  columns,
  data,
  loading,
  pageSize = PAGE_SIZE.DEFAULT,
  emptyMessage = "ไม่พบข้อมูล",
  emptyDescription,
  onRowClick,
  token,
  footer,
  className,
}: ReportDataTableProps<T>) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paged = data.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Rows open a detail view, so they have to answer the keyboard too — a click handler on a
  // <tr> is invisible to Tab and Enter on its own. The handler that used to come with it,
  // role="button" on the <tr>, is what a table must not do: a row that calls itself a button
  // stops being a row, and every cell under it stops belonging to a column. Screen readers lose
  // the whole grid. The keyboard gets its answer from a real <button> wrapping the first cell
  // instead (below) — activating it fires a click that bubbles to this handler, so the two paths
  // stay one path and neither fires twice.
  const rowProps = (row: T) => (onRowClick ? { onClick: () => onRowClick(row) } : {});
  // select-none: on touch, a tap that drifts a pixel selects the row's text instead of opening it.
  // has-focus-visible: the row itself is never focused — the button in its first cell is — so the
  // highlight has to follow the descendant, or tabbing through the table shows nothing at all.
  const rowCls = onRowClick
    ? "cursor-pointer select-none hover:bg-muted/50 has-focus-visible:bg-muted/50"
    : "";

  // One Card, three bodies — never three returns. A server-paged caller hands its own pager in
  // `footer`, and an early return for loading/empty takes that pager off the screen with it:
  // every page change unmounts and remounts it (the `loading` prop it accepts to stay put and
  // grey out can then never do anything), and a page that comes back empty leaves the reader
  // with no control at all to get back to page 1.
  const body = loading ? (
    <div className="p-8 text-center text-sm text-muted-foreground">
      กำลังโหลด…
    </div>
  ) : data.length === 0 ? (
    <EmptyState title={emptyMessage} description={emptyDescription} />
  ) : (
    // One table at every width. The stacked label→value cards this replaced turned a
    // six-column row into six lines, so a phone screen held one row and a half; a table
    // that scrolls sideways shows the shape of the data even when it does not all fit.
    // `Table` brings its own overflow-x-auto, min-w keeps the columns from crushing.
    <div>
      <Table grid zebra className="min-w-[640px]">
        <TableHeader>
          {/* The header wash is what tells you at a glance which section's table you scrolled
              into once several of them look alike. */}
          <TableRow style={token ? { backgroundColor: tokenTint(token, 14) } : undefined}>
            {columns.map((col) => (
              <TableHead key={col.key} className={cn("px-2", col.className)}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.map((row, i) => (
            // Zebra rows come from Table's `grid` skin: tracking one row across seven columns
            // is where the eye slips a line.
            <TableRow key={i} className={rowCls} {...rowProps(row)}>
              {columns.map((col, ci) => {
                const content = col.render
                  ? col.render(row)
                  : (row[col.key] as React.ReactNode) ?? "—";
                return (
                  <TableCell key={col.key} className={cn("px-2", col.className)}>
                    {/* หนึ่งแถวมีตัวควบคุมตัวเดียว อยู่ที่ช่องแรก — ปุ่มเปล่าโดยตั้งใจ: click ที่
                        เกิดจากการกด Enter/Space วิ่งขึ้นไปหา onClick ของแถวเอง */}
                    {onRowClick && ci === 0 ? (
                      <button type="button" className="w-full text-left focus-visible:outline-none">
                        {content}
                      </button>
                    ) : (
                      content
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    // py-0: Card's own pt-4 showed as a bare white band above the tinted header.
    // border: Card ships only a faint shadow, which disappears on the muted page background —
    // every other table in the app (/items, /maintenance, /alerts) draws a real edge.
    <Card className={cn("py-0 border", className)}>
      {body}
      {/* The caller's own pager stays put through loading and empty alike. The built-in one
          does not: it pages `data` in the browser, so with nothing to slice there is nothing
          for it to do. */}
      {footer ??
        (!loading && data.length > 0 && totalPages > 1 && (
          <Pagination
            page={currentPage}
            total={data.length}
            pageSize={pageSize}
            onChange={setPage}
          />
        ))}
    </Card>
  );
}
