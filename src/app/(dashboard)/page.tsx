import { getAlertCounts } from "@/lib/alerts";
import { getSessionUser } from "@/lib/auth";
import { canManageStock } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { DashboardAlertBar } from "@/components/dashboard/dashboard-alert-bar";
import { DashboardKpiGrid } from "@/components/dashboard/dashboard-kpi-grid";
import { DashboardBody } from "@/components/dashboard/dashboard-body";

export default async function DashboardPage() {
  const user = await getSessionUser();
  // EXECUTIVE is bounced off /receive and /maintenance by middleware and lands back here,
  // so their KPI cards must point at the read-only report that shows the same rows.
  const canManage = canManageStock(user?.role ?? "");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    counts,
    receiveThisMonth, dispenseThisMonth,
    receiveQtyThis, receiveQtyLast, dispenseQtyThis, dispenseQtyLast,
  ] = await Promise.all([
    getAlertCounts(),
    prisma.receiveRecord.count({ where: { receivedAt: { gte: monthStart } } }),
    prisma.dispenseRecord.count({ where: { dispensedAt: { gte: monthStart } } }),
    prisma.receiveRecord.aggregate({ _sum: { quantity: true }, where: { receivedAt: { gte: monthStart } } }),
    prisma.receiveRecord.aggregate({ _sum: { quantity: true }, where: { receivedAt: { gte: lastMonthStart, lt: monthStart } } }),
    prisma.dispenseRecord.aggregate({ _sum: { quantity: true }, where: { dispensedAt: { gte: monthStart } } }),
    prisma.dispenseRecord.aggregate({ _sum: { quantity: true }, where: { dispensedAt: { gte: lastMonthStart, lt: monthStart } } }),
  ]);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <DashboardGreeting />

      <DashboardAlertBar counts={counts} />

      <DashboardKpiGrid
        kpis={{
          receiveThisMonth,
          receiveQtyThisMonth: receiveQtyThis._sum.quantity ?? 0,
          receiveQtyLastMonth: receiveQtyLast._sum.quantity ?? 0,
          dispenseThisMonth,
          dispenseQtyThisMonth: dispenseQtyThis._sum.quantity ?? 0,
          dispenseQtyLastMonth: dispenseQtyLast._sum.quantity ?? 0,
        }}
        canManage={canManage}
      />

      <DashboardBody />
    </div>
  );
}
