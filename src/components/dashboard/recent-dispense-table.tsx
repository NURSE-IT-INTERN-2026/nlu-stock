"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pagination } from "./pagination";
import { USAGE_TYPE_LABELS } from "@/lib/constants";
import type { DispenseRecord } from "@/lib/dashboard-types";

interface RecentDispenseTableProps {
  data: DispenseRecord[];
}

const PAGE_SIZE = 5;

export function RecentDispenseTable({ data }: RecentDispenseTableProps) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const tableRef = useRef<HTMLDivElement>(null);

  const sliced = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const handleRowNav = useCallback(
    (itemId: string) => router.push(`/items/${itemId}`),
    [router],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, itemId: string) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleRowNav(itemId);
      }
    },
    [handleRowNav],
  );

  return (
    <Card>
      <CardHeader className="border-b py-3">
        <CardTitle className="text-base font-semibold text-foreground">
          รายการเบิกล่าสุด
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">ไม่มีรายการ</p>
        ) : (
          <div className="overflow-x-auto" ref={tableRef}>
            <Table role="grid" className="table-fixed">
              <TableHeader>
                <TableRow className="[&>th]:h-8 [&>th]:py-0 [&>th]:text-xs [&>th]:text-muted-foreground">
                  <TableHead className="w-32 px-2">วันที่</TableHead>
                  <TableHead className="px-2">รายการ</TableHead>
                  <TableHead className="w-20 px-2 text-right">จำนวน</TableHead>
                  <TableHead className="hidden sm:table-cell w-32 px-2">ผู้เบิก</TableHead>
                  <TableHead className="hidden md:table-cell w-32 px-2">ประเภท</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sliced.map((r) => (
                  <TableRow
                    key={r.id}
                    tabIndex={0}
                    role="row"
                    className="h-9 cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&>td]:py-1"
                    onClick={() => handleRowNav(r.item.id)}
                    onKeyDown={(e) => handleKeyDown(e, r.item.id)}
                    aria-label={`${r.item.code} ${r.item.name}, ${r.quantity} ชิ้น`}
                  >
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground px-2">
                      {fmtDate(new Date(r.dispensedAt), "dd MMM HH:mm")}
                    </TableCell>
                    <TableCell className="px-2">
                      <div className="flex items-center min-w-0 gap-1">
                        <span className="font-mono text-xs text-foreground font-semibold underline decoration-primary/30 underline-offset-2 shrink-0">{r.item.code}</span>
                        <span className="hidden sm:inline text-foreground/80 font-medium truncate min-w-0">{r.item.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm text-foreground font-bold px-2">{r.quantity}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-foreground/80 font-medium px-2">{r.staff.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground px-2">
                      {r.usageType ? USAGE_TYPE_LABELS[r.usageType] ?? r.usageType : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination page={page} total={data.length} pageSize={PAGE_SIZE} onChange={handlePageChange} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
