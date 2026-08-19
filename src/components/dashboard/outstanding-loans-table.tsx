"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, TH_DAY } from "@/lib/format";
import { Panel, WidgetState } from "./primitives";
import { useOutstandingLoans } from "@/hooks/use-dashboard-queries";

/**
 * รายการค้างคืน — a worklist, ordered by how overdue.
 *
 * There is no ผู้ยืม column because there is no ผู้ยืม field: the cart asks what the stock is
 * for, not whose name is on it (lib/constants recipientLabel). เหตุผล stands in its place and
 * is the more actionable half — "ยืมไปสอน 001101" says where to go, which a name in a system
 * with two staff accounts does not.
 */
export function OutstandingLoansTable() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useOutstandingLoans();
  const rows = data?.rows ?? [];

  const go = (itemId: string) => router.push(`/items/${itemId}`);

  return (
    <Panel
      title="รายการค้างคืน"
      hint={
        data
          ? `ทั้งหมด ${data.total.toLocaleString("th-TH")} รายการ · เกินกำหนด ${data.overdue.toLocaleString("th-TH")} รายการ`
          : "ของที่ยังไม่ได้คืน"
      }
      action={
        data && data.total > 0 ? (
          <Link href="/alerts?overdueReturn=true" className="shrink-0 text-xs font-medium text-primary hover:underline">
            ทวงคืนทั้งหมด
          </Link>
        ) : undefined
      }
      bodyClassName="p-0"
    >
      <WidgetState
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
        isEmpty={rows.length === 0}
        icon={PackageCheck}
        emptyTitle="ไม่มีของค้างคืน"
        emptyHint="ทุกอย่างที่ยืมออกไปกลับมาครบแล้ว"
      >
        <Table grid zebra className="min-w-[640px]">
          <TableHeader>
            <TableRow className="bg-secondary/40">
              <TableHead>รายการ</TableHead>
              <TableHead>เหตุผล</TableHead>
              <TableHead className="text-right">จำนวน</TableHead>
              <TableHead>ครบกำหนด</TableHead>
              <TableHead>สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.id}
                tabIndex={0}
                onClick={() => go(r.itemId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    go(r.itemId);
                  }
                }}
                aria-label={`${r.code} ${r.name}`}
                className="cursor-pointer focus-visible:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <TableCell className="h-auto py-2">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.code} · ยืม {fmtDate(new Date(r.dispensedAt), TH_DAY)}
                  </p>
                </TableCell>
                {/* A loan filed before เหตุผล was required has nothing to show here, and an
                    em dash is more honest than repeating the item name. */}
                <TableCell className="text-muted-foreground">{r.reason ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{r.quantity.toLocaleString("th-TH")}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.dueAt ? fmtDate(new Date(r.dueAt), TH_DAY) : "ไม่กำหนด"}
                </TableCell>
                <TableCell>
                  {r.overdueDays === null ? (
                    <span className="inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success-700 dark:text-success-200">
                      ตามกำหนด
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-danger-700 dark:text-danger-400">
                      เกิน {r.overdueDays.toLocaleString("th-TH")} วัน
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </WidgetState>
    </Panel>
  );
}
