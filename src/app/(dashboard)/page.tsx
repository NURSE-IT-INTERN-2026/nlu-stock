import { getAlertCounts } from "@/lib/alerts";
import { DashboardMetricCard } from "@/components/dashboard/dashboard-metric-card";
import { StatusOverviewWidget } from "@/components/dashboard/status-overview-widget";
import { DashboardTables } from "@/components/dashboard/dashboard-charts";
import { DashboardBarCharts } from "@/components/dashboard/dashboard-bar-charts";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";

export default async function DashboardPage() {
  const { lowStock, nearExpiry, overdueMaintenance: overdueMaint } = await getAlertCounts();

  return (
    <div className="flex flex-col gap-6">
      <DashboardGreeting />

      {/* Metric cards — horizontal row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <DashboardMetricCard
          title="สต๊อกต่ำ"
          value={lowStock}
          subtitle={lowStock > 0 ? "ต่ำกว่าขั้นต่ำ" : undefined}
          iconName="AlertTriangle"
          color="text-orange-500"
          href="/items?lowStock=true"
        />
        <DashboardMetricCard
          title="ใกล้หมดอายุ"
          value={nearExpiry}
          subtitle={nearExpiry > 0 ? "หมดอายุใน 90 วัน" : undefined}
          iconName="Package"
          color="text-info-500"
          href="/items?nearExpiry=true"
        />
        <DashboardMetricCard
          title="บำรุงเกินกำหนด"
          value={overdueMaint}
          subtitle={overdueMaint > 0 ? "เกินกำหนดแล้ว" : undefined}
          iconName="Wrench"
          color="text-danger-500"
          href="/items?overdueMaint=true"
        />
      </div>

      {/* Charts + status overview */}
      <div className="grid gap-4 lg:grid-cols-5 items-stretch">
        <div className="lg:col-span-1 flex">
          <StatusOverviewWidget />
        </div>
        <div className="lg:col-span-4">
          <DashboardBarCharts />
        </div>
      </div>

      {/* Full-width tables */}
      <DashboardTables />
    </div>
  );
}
