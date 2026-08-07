"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardTables } from "./dashboard-charts";
import { ProfileSummaryWidget } from "./profile-summary-widget";
import { AssetStatusChart } from "./asset-status-chart";
import { MovementChart } from "./movement-chart";
import { TopDispenseChart } from "./top-dispense-chart";
import { UsageBySubjectChart } from "./usage-by-subject-chart";
import { useTopDispense, useUsageBySubject } from "@/hooks/use-dashboard-queries";

function ChartError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-[320px] flex-col items-center justify-center gap-2 rounded-xl border">
      <p className="text-sm text-destructive">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>โหลดใหม่</Button>
    </div>
  );
}

function TopDispenseWidget() {
  const { data, isLoading, error, refetch } = useTopDispense();
  if (isLoading) return <Skeleton className="h-[320px] w-full rounded-xl" />;
  if (error) return <ChartError message={error.message} onRetry={() => refetch()} />;
  return <TopDispenseChart data={data ?? []} />;
}

function UsageBySubjectWidget() {
  const { data, isLoading, error, refetch } = useUsageBySubject();
  if (isLoading) return <Skeleton className="h-[320px] w-full rounded-xl" />;
  if (error) return <ChartError message={error.message} onRetry={() => refetch()} />;
  return <UsageBySubjectChart data={data ?? []} />;
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-1">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

// One scrolling page, not tabs. Everything here is a summary that links out to the page
// where the work actually happens, so hiding two thirds of it behind tabs only guaranteed
// nobody saw it — the old Tabs did not even sync to the URL, so a refresh always snapped
// back to the first one.
//
// Order follows what has data on day one. Master-data imports carry no movement history
// (see api/settings/import), so รับเข้า/เบิกออก start empty and stay empty for months —
// the two widgets that read straight from Item/SubItem go first so the page is never bare.
export function DashboardBody() {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="คลังของเรา" subtitle="สิ่งที่มีอยู่ตอนนี้" />
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <ProfileSummaryWidget />
        <AssetStatusChart />
      </div>

      <SectionHeading title="การเคลื่อนไหว" subtitle="รับเข้า เบิกออก และการใช้งาน" />
      <MovementChart />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopDispenseWidget />
        <UsageBySubjectWidget />
      </div>
      <DashboardTables />
    </div>
  );
}
