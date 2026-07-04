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
            <Table role="grid">
              <TableHeader>
                <TableRow>
                  <TableHead>วันที่</TableHead>
                  <TableHead>รายการ</TableHead>
                  <TableHead className="text-right">จำนวน</TableHead>
                  <TableHead className="hidden sm:table-cell">ผู้เบิก</TableHead>
                  <TableHead className="hidden md:table-cell">ประเภท</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sliced.map((r) => (
                  <TableRow
                    key={r.id}
                    tabIndex={0}
                    role="row"
                    className="cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    onClick={() => handleRowNav(r.item.id)}
                    onKeyDown={(e) => handleKeyDown(e, r.item.id)}
                    aria-label={`${r.item.code} ${r.item.name}, ${r.quantity} ชิ้น`}
                  >
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      {fmtDate(new Date(r.dispensedAt), "dd MMM HH:mm")}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-mono text-foreground font-semibold underline decoration-primary/30 underline-offset-2">{r.item.code}</span>{" "}
                      <span className="hidden sm:inline text-foreground/80 font-medium">{r.item.name}</span>
                    </TableCell>
                    <TableCell className="text-right text-sm text-foreground font-bold">{r.quantity}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-foreground/80 font-medium">{r.staff.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
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
