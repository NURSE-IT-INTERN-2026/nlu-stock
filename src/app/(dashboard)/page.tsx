import { getAlertCounts } from "@/lib/alerts";
import { DashboardMetricCard } from "@/components/dashboard/dashboard-metric-card";
import { MonthlyDispenseWidget } from "@/components/dashboard/monthly-dispense-widget";
import { ProfileSummaryWidget } from "@/components/dashboard/profile-summary-widget";
import { DashboardTables } from "@/components/dashboard/dashboard-charts";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";

export default async function DashboardPage() {
  const { lowStock, nearExpiry, totalItems, onLoan } = await getAlertCounts();

  return (
    <div className="flex flex-col gap-6">
      <DashboardGreeting />

      {/* Metric cards — horizontal row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <DashboardMetricCard
          title="รายการพัสดุในคลังทั้งหมด"
          value={totalItems}
          subtitle="รายการ"
          iconName="Package"
          color="text-success"
          href="/items"
        />
        <DashboardMetricCard
          title="คงคลังต่ำกว่าเกณฑ์ขั้นต่ำ"
          value={lowStock}
          subtitle={lowStock > 0 ? "รายการ" : undefined}
          iconName="AlertTriangle"
          color="text-orange-500"
          href="/alerts?lowStock=true"
        />
        <DashboardMetricCard
          title="หมดอายุภายใน 30 วัน"
          value={nearExpiry}
          subtitle={nearExpiry > 0 ? "รายการ" : undefined}
          iconName="CalendarClock"
          color="text-info-500"
          href="/alerts?nearExpiry=true"
        />
        <DashboardMetricCard
          title="อยู่ระหว่างการยืม ค้างส่งคืน"
          value={onLoan}
          subtitle={onLoan > 0 ? "รายการ" : undefined}
          iconName="Undo2"
          color="text-danger-500"
          href="/items?onLoan=true"
        />
      </div>

      {/* Monthly dispense + category breakdown */}
      <div className="grid gap-4 lg:grid-cols-3 items-stretch">
        <div className="lg:col-span-2">
          <MonthlyDispenseWidget />
        </div>
        <ProfileSummaryWidget />
      </div>

      {/* Full-width tables */}
      <DashboardTables />
    </div>
  );
}
