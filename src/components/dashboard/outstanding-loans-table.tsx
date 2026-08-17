"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">รายการ</th>
                <th className="px-4 py-2.5 font-medium">เหตุผล</th>
                <th className="px-4 py-2.5 text-right font-medium">จำนวน</th>
                <th className="px-4 py-2.5 font-medium">ครบกำหนด</th>
                <th className="px-4 py-2.5 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
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
                  className="cursor-pointer border-b transition-colors last:border-0 hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.code} · ยืม {fmtDate(new Date(r.dispensedAt), TH_DAY)}
                    </p>
                  </td>
                  {/* A loan filed before เหตุผล was required has nothing to show here, and an
                      em dash is more honest than repeating the item name. */}
                  <td className="px-4 py-3 text-muted-foreground">{r.reason ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{r.quantity.toLocaleString("th-TH")}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.dueAt ? fmtDate(new Date(r.dueAt), TH_DAY) : "ไม่กำหนด"}
                  </td>
                  <td className="px-4 py-3">
                    {r.overdueDays === null ? (
                      <span className="inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success-700 dark:text-success-200">
                        ตามกำหนด
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-danger-700 dark:text-danger-400">
                        เกิน {r.overdueDays.toLocaleString("th-TH")} วัน
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </WidgetState>
    </Panel>
  );
}
