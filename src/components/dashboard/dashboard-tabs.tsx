"use client";

import { Boxes, Wrench, TrendingUp, ListTodo } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MonthlyDispenseWidget } from "./monthly-dispense-widget";
import { ProfileSummaryWidget } from "./profile-summary-widget";
import { DashboardTables } from "./dashboard-charts";
import { TopDispenseChart } from "./top-dispense-chart";
import { UsageBySubjectChart } from "./usage-by-subject-chart";
import { AssetStatusChart } from "./asset-status-chart";
import { MovementChart } from "./movement-chart";
import { RepairStatusWidget } from "./repair-status-widget";
import { RepairInProgressList } from "./repair-inprogress-list";
import { OverdueReturnList } from "./overdue-return-list";
import { LowStockList } from "./low-stock-list";
import { MaintenanceFollowupList } from "./maintenance-followup-list";
import {
  useTopDispense, useUsageBySubject,
  useRepairStatus, useRepairInProgress, useOverdueReturn,
  useLowStock, useMaintenanceFollowup,
} from "@/hooks/use-dashboard-queries";

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

function RepairStatusWidgetContainer() {
  const { data, isLoading, error, refetch } = useRepairStatus();
  if (isLoading) return <Skeleton className="h-[240px] w-full rounded-xl" />;
  if (error) return <ChartError message={error.message} onRetry={() => refetch()} />;
  return <RepairStatusWidget data={data ?? { damaged: 0, underRepair: 0 }} />;
}

function RepairInProgressWidget() {
  const { data, isLoading, error, refetch } = useRepairInProgress();
  if (isLoading) return <Skeleton className="h-[240px] w-full rounded-xl" />;
  if (error) return <ChartError message={error.message} onRetry={() => refetch()} />;
  return <RepairInProgressList data={data ?? []} />;
}

function OverdueReturnWidget() {
  const { data, isLoading, error, refetch } = useOverdueReturn();
  if (isLoading) return <Skeleton className="h-[240px] w-full rounded-xl" />;
  if (error) return <ChartError message={error.message} onRetry={() => refetch()} />;
  return <OverdueReturnList data={data ?? []} />;
}

function LowStockWidget() {
  const { data, isLoading, error, refetch } = useLowStock();
  if (isLoading) return <Skeleton className="h-[240px] w-full rounded-xl" />;
  if (error) return <ChartError message={error.message} onRetry={() => refetch()} />;
  return <LowStockList data={data ?? []} />;
}

function MaintenanceFollowupWidget() {
  const { data, isLoading, error, refetch } = useMaintenanceFollowup();
  if (isLoading) return <Skeleton className="h-[240px] w-full rounded-xl" />;
  if (error) return <ChartError message={error.message} onRetry={() => refetch()} />;
  return <MaintenanceFollowupList data={data ?? []} />;
}

export function DashboardTabs() {
  return (
    <Tabs defaultValue="overview" className="gap-4">
      <TabsList className="w-full max-w-full justify-start overflow-x-auto">
        <TabsTrigger value="overview"><TrendingUp className="hidden sm:inline-block" /> ภาพรวม</TabsTrigger>
        <TabsTrigger value="movement"><Boxes className="hidden sm:inline-block" /> การเคลื่อนไหว</TabsTrigger>
        <TabsTrigger value="assets"><Wrench className="hidden sm:inline-block" /> ครุภัณฑ์ &amp; ซ่อม</TabsTrigger>
        <TabsTrigger value="actions"><ListTodo className="hidden sm:inline-block" /> ต้องดำเนินการ</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="flex flex-col gap-4">
        <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
          <ProfileSummaryWidget />
          <div className="min-w-0 lg:col-span-2">
            <MonthlyDispenseWidget />
          </div>
        </div>
        <DashboardTables />
      </TabsContent>

      <TabsContent value="movement" className="flex flex-col gap-4">
        <MovementChart />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TopDispenseWidget />
          <UsageBySubjectWidget />
        </div>
      </TabsContent>

      <TabsContent value="assets" className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AssetStatusChart />
          <RepairStatusWidgetContainer />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RepairInProgressWidget />
          <OverdueReturnWidget />
        </div>
      </TabsContent>

      <TabsContent value="actions" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <LowStockWidget />
        <OverdueReturnWidget />
        <MaintenanceFollowupWidget />
      </TabsContent>
    </Tabs>
  );
}
