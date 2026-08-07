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
import { ComingSoon } from "./coming-soon";
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ComingSoon title="แผนกที่เบิกมากที่สุด" subtitle="เดือนนี้" note="ยังไม่มีข้อมูลแผนก/หน่วยงานผู้เบิกในระบบ" />
          <ComingSoon title="สัดส่วนผู้ขาย" subtitle="รับเข้าเดือนนี้" note="ยังไม่มีข้อมูลผู้ขายในระบบรับเข้า" />
        </div>
      </TabsContent>

      <TabsContent value="assets" className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AssetStatusChart />
          <ComingSoon title="สถานะงานบำรุงรักษา" subtitle="รอส่งซ่อม / กำลังซ่อม / เสร็จ" minHeight={240} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ComingSoon title="งานซ่อมที่กำลังดำเนินการ" />
          <ComingSoon title="คืนเกินกำหนด" />
        </div>
      </TabsContent>

      <TabsContent value="actions" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ComingSoon title="รายการใกล้หมด / หมดสต็อก" note="ดูรายการเต็มได้ที่หน้าแจ้งเตือน" />
        <ComingSoon title="คืนเกินกำหนด" note="ดูรายการเต็มได้ที่หน้าแจ้งเตือน" />
        <ComingSoon title="งานซ่อมที่ต้องติดตาม" note="ดูรายการเต็มได้ที่หน้าแจ้งเตือน" />
      </TabsContent>
    </Tabs>
  );
}
