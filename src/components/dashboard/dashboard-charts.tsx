"use client";

import { fmtDate, TH_DAY } from "@/lib/format";
import { USAGE_TYPE_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { MoveTable } from "./move-table";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { useRecentDispense, useRecentReceive } from "@/hooks/use-dashboard-queries";

export function DashboardTables() {
  const dispenseQuery = useRecentDispense();
  const receiveQuery = useRecentReceive();

  const loading = dispenseQuery.isLoading || receiveQuery.isLoading;
  const error = dispenseQuery.error?.message ?? receiveQuery.error?.message ?? null;

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="animate-fade-in py-8 text-center">
        <p className="mb-2 text-destructive">{error}</p>
        <Button
          variant="outline"
          onClick={() => {
            dispenseQuery.refetch();
            receiveQuery.refetch();
          }}
        >
          โหลดใหม่
        </Button>
      </div>
    );
  }

  const dispenseRows = (dispenseQuery.data ?? []).map((r) => ({
    id: r.id,
    itemId: r.item.id,
    date: fmtDate(new Date(r.dispensedAt), `${TH_DAY} HH:mm`),
    name: r.item.name,
    code: r.item.code,
    kind: r.usageType ? USAGE_TYPE_LABELS[r.usageType] ?? r.usageType : undefined,
    qty: r.quantity,
    who: r.staff.name,
  }));

  const receiveRows = (receiveQuery.data ?? []).map((r) => ({
    id: r.id,
    itemId: r.item.id,
    date: fmtDate(new Date(r.receivedAt), `${TH_DAY} HH:mm`),
    name: r.item.name,
    code: r.item.code,
    qty: r.quantity,
    who: r.receiver.name,
  }));

  return (
    <div className="animate-fade-in grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
      <MoveTable title="รายการเบิกล่าสุด" rows={dispenseRows} tone="issued" whoLabel="ผู้เบิก" />
      <MoveTable title="รายการรับเข้าล่าสุด" rows={receiveRows} tone="received" whoLabel="ผู้รับ" />
    </div>
  );
}
