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
  /** Optional — makes each row a button opening a detail view. Desktop + mobile alike. */
  onRowClick?: (row: T) => void;
  /** Tints the header with the section's event colour. Omit for the plain header. */
  token?: Token;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ReportDataTable<T extends Record<string, any>>({
  columns,
  data,
  loading,
  pageSize = PAGE_SIZE.DEFAULT,
  emptyMessage = "ไม่พบข้อมูล",
  onRowClick,
  token,
}: ReportDataTableProps<T>) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paged = data.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Rows open a detail view, so they have to answer the keyboard too — a click handler on a
  // <tr>/<div> is invisible to Tab and Enter on its own.
  const rowProps = (row: T) =>
    onRowClick
      ? {
          role: "button" as const,
          tabIndex: 0,
          onClick: () => onRowClick(row),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onRowClick(row);
            }
          },
        }
      : {};
  // select-none: on touch, a tap that drifts a pixel selects the row's text instead of opening it.
  const rowCls = onRowClick
    ? "cursor-pointer select-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
    : "";

  if (loading) {
    return (
      <Card className="py-0">
        <div className="p-8 text-center text-sm text-muted-foreground">
          กำลังโหลด…
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="py-0">
        <div className="p-8 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      </Card>
    );
  }

  return (
    // py-0: Card's own pt-4 showed as a bare white band above the tinted header.
    <Card className="py-0">
      {/* One table at every width. The stacked label→value cards this replaced turned a
          six-column row into six lines, so a phone screen held one row and a half; a table
          that scrolls sideways shows the shape of the data even when it does not all fit.
          `Table` brings its own overflow-x-auto, min-w keeps the columns from crushing. */}
      <div>
        <Table className="min-w-[640px]">
          <TableHeader>
            {/* The header wash is what tells you at a glance which section's table you scrolled
                into once several of them look alike. */}
            <TableRow style={token ? { backgroundColor: tokenTint(token, 14) } : undefined}>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn("border-r border-border/70 px-2 last:border-r-0", col.className)}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((row, i) => (
              // Zebra rows: report tables run wide, and tracking one row across seven columns
              // is where the eye slips a line.
              <TableRow
                key={i}
                className={cn(i % 2 === 1 && "bg-muted/25", rowCls)}
                {...rowProps(row)}
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn("border-r border-border/60 px-2 last:border-r-0", col.className)}
                  >
                    {col.render
                      ? col.render(row)
                      : (row[col.key] as React.ReactNode) ?? "—"}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <Pagination
          page={currentPage}
          total={data.length}
          pageSize={pageSize}
          onChange={setPage}
        />
      )}
    </Card>
  );
}
