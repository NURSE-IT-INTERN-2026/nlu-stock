import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { getAlertCounts } from "@/lib/alerts";
import { getSessionUser } from "@/lib/auth";
import { canManageStock } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { DashboardAlertBar } from "@/components/dashboard/dashboard-alert-bar";
import { DashboardKpiGrid } from "@/components/dashboard/dashboard-kpi-grid";
import { DashboardBody } from "@/components/dashboard/dashboard-body";
import { monthlyFlow, sparkStart } from "@/lib/dashboard-kpis";

export default async function DashboardPage() {
  const user = await getSessionUser();
  // EXECUTIVE is bounced off /receive and /maintenance by middleware and lands back here,
  // so their KPI cards must point at the read-only report that shows the same rows.
  const canManage = canManageStock(user?.role ?? "");
  const now = new Date();
  const since = sparkStart(now);

  // One query per table instead of three aggregates each: monthlyFlow derives the headline
  // count, this/last month quantity and the whole sparkline from the same rows.
  const [counts, receiveRows, dispenseRows] = await Promise.all([
    getAlertCounts(),
    prisma.receiveRecord.findMany({
      where: { receivedAt: { gte: since } },
      select: { receivedAt: true, quantity: true },
    }),
    prisma.dispenseRecord.findMany({
      where: { dispensedAt: { gte: since } },
      select: { dispensedAt: true, quantity: true },
    }),
  ]);

  const received = monthlyFlow(receiveRows.map((r) => ({ at: r.receivedAt, quantity: r.quantity })), now);
  const dispensed = monthlyFlow(dispenseRows.map((r) => ({ at: r.dispensedAt, quantity: r.quantity })), now);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <DashboardGreeting />

      <DashboardAlertBar counts={counts} />

      <DashboardKpiGrid
        kpis={{
          receiveThisMonth: received.thisMonthCount,
          receiveQtyThisMonth: received.thisMonthQty,
          receiveQtyLastMonth: received.lastMonthQty,
          receiveSpark: received.spark,
          dispenseThisMonth: dispensed.thisMonthCount,
          dispenseQtyThisMonth: dispensed.thisMonthQty,
          dispenseQtyLastMonth: dispensed.lastMonthQty,
          dispenseSpark: dispensed.spark,
        }}
        canManage={canManage}
      />

      {/* DashboardBody reads the active tab from the URL (useSearchParams), which needs a
          boundary here or the whole route opts out of prerendering. */}
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <DashboardBody />
      </Suspense>
    </div>
  );
}
