import { getAlertCounts } from "@/lib/alerts";
import { getSessionUser } from "@/lib/auth";
import { canManageStock } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { DashboardKpiGrid } from "@/components/dashboard/dashboard-kpi-grid";
import { DashboardAlertBar } from "@/components/dashboard/dashboard-alert-bar";
import { DashboardBody } from "@/components/dashboard/dashboard-body";

export default async function DashboardPage() {
  const user = await getSessionUser();
  // EXECUTIVE is bounced off /receive and /maintenance by middleware and lands back here,
  // so their KPI cards must point at the read-only report that shows the same rows.
  const canManage = canManageStock(user?.role ?? "");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const outstandingLoan = { returnedAt: null, OR: [{ loanType: null }, { loanType: "BORROW" as const }] };

  const [
    counts, totalPieces,
    receiveThisMonth, dispenseThisMonth,
    receiveQtyThis, receiveQtyLast, dispenseQtyThis, dispenseQtyLast,
    itemRepair, subItemRepair,
    dueTodayReturns, outOfStock,
  ] = await Promise.all([
    getAlertCounts(),
    prisma.item.aggregate({ _sum: { totalQty: true }, where: { isActive: true } }),
    prisma.receiveRecord.count({ where: { receivedAt: { gte: monthStart } } }),
    prisma.dispenseRecord.count({ where: { dispensedAt: { gte: monthStart } } }),
    prisma.receiveRecord.aggregate({ _sum: { quantity: true }, where: { receivedAt: { gte: monthStart } } }),
    prisma.receiveRecord.aggregate({ _sum: { quantity: true }, where: { receivedAt: { gte: lastMonthStart, lt: monthStart } } }),
    prisma.dispenseRecord.aggregate({ _sum: { quantity: true }, where: { dispensedAt: { gte: monthStart } } }),
    prisma.dispenseRecord.aggregate({ _sum: { quantity: true }, where: { dispensedAt: { gte: lastMonthStart, lt: monthStart } } }),
    prisma.item.count({ where: { isActive: true, trackIndividually: false, status: "UNDER_REPAIR" } }),
    prisma.subItem.count({ where: { status: "UNDER_REPAIR", item: { isActive: true } } }),
    prisma.dispenseRecord.count({ where: { ...outstandingLoan, dueAt: { gte: todayStart, lt: todayEnd } } }),
    prisma.item.count({ where: { isActive: true, availableQty: 0 } }),
  ]);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <DashboardGreeting />

      <DashboardKpiGrid
        kpis={{
          totalItems: counts.totalItems,
          totalPieces: totalPieces._sum.totalQty ?? 0,
          receiveThisMonth,
          receiveQtyThisMonth: receiveQtyThis._sum.quantity ?? 0,
          receiveQtyLastMonth: receiveQtyLast._sum.quantity ?? 0,
          dispenseThisMonth,
          dispenseQtyThisMonth: dispenseQtyThis._sum.quantity ?? 0,
          dispenseQtyLastMonth: dispenseQtyLast._sum.quantity ?? 0,
          onLoan: counts.onLoan,
          overdueReturn: counts.overdueReturn,
          dueTodayReturns,
          inRepair: itemRepair + subItemRepair,
          damagedPending: counts.damagedPending,
          lowStock: counts.lowStock,
          outOfStock,
        }}
        canManage={canManage}
      />

      <DashboardAlertBar counts={counts} />

      <DashboardBody />
    </div>
  );
}
