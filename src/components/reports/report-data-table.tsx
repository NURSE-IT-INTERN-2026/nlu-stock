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
import { Pagination } from "@/components/dashboard/pagination";

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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ReportDataTable<T extends Record<string, any>>({
  columns,
  data,
  loading,
  pageSize = 20,
  emptyMessage = "ไม่พบข้อมูล",
}: ReportDataTableProps<T>) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paged = data.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (loading) {
    return (
      <Card>
        <div className="p-8 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <div className="p-8 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      {/* Desktop: table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="[&>th]:h-8 [&>th]:py-0 [&>th]:text-xs [&>th]:text-muted-foreground">
              {columns.map((col) => (
                <TableHead key={col.key} className={`px-2 ${col.className ?? ""}`}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((row, i) => (
              <TableRow key={i} className="h-9 [&>td]:py-1">
                {columns.map((col) => (
                  <TableCell key={col.key} className={`px-2 ${col.className ?? ""}`}>
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

      {/* Mobile: stacked label→value cards (no horizontal scroll) */}
      <div className="divide-y divide-border md:hidden">
        {paged.map((row, i) => (
          <div key={i} className="space-y-1 px-4 py-2.5">
            {columns.map((col) => {
              const value = col.render ? col.render(row) : (row[col.key] as React.ReactNode) ?? "—";
              return (
                <div key={col.key} className="flex items-start justify-between gap-3 text-sm">
                  <span className="shrink-0 text-xs text-muted-foreground">{col.header}</span>
                  <span className="min-w-0 text-right break-words">{value}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="px-4 pb-4">
          <Pagination
            page={currentPage}
            total={data.length}
            pageSize={pageSize}
            onChange={setPage}
          />
        </div>
      )}
    </Card>
  );
}
