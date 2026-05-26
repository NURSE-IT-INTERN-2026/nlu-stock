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
  emptyMessage = "No data found",
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
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={col.className}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paged.map((row, i) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell key={col.key} className={col.className}>
                  {col.render
                    ? col.render(row)
                    : (row[col.key] as React.ReactNode) ?? "—"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="px-4 pb-4">
        <Pagination
          page={currentPage}
          total={data.length}
          pageSize={pageSize}
          onChange={setPage}
        />
      </div>
    </Card>
  );
}
