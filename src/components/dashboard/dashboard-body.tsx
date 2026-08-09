"use client";

import type { ComponentType } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardTables } from "./dashboard-charts";
import { DashboardScopeBar } from "./dashboard-scope-bar";
import { ProfileSummaryWidget } from "./profile-summary-widget";
import { AssetStatusChart } from "./asset-status-chart";
import { MovementChart } from "./movement-chart";
import { TopDispenseChart } from "./top-dispense-chart";
import { UsageBySubjectChart } from "./usage-by-subject-chart";
import { RepairStatusWidget } from "./repair-status-widget";
import { DashboardScopeProvider } from "@/hooks/use-dashboard-scope";
import { parseScope, scopeQuery, type DashboardScope } from "@/lib/dashboard-scope";
import type { DispenseType } from "@/generated/prisma/enums";
import { useTopDispense, useUsageBySubject, useRepairStatus } from "@/hooks/use-dashboard-queries";

function ChartError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-[320px] flex-col items-center justify-center gap-2 rounded-2xl border bg-card">
      <p className="text-sm text-destructive">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>โหลดใหม่</Button>
    </div>
  );
}

function TopDispenseWidget() {
  const { data, isLoading, error, refetch } = useTopDispense();
  if (isLoading) return <Skeleton className="h-[320px] w-full rounded-2xl" />;
  if (error) return <ChartError message={error.message} onRetry={() => refetch()} />;
  return <TopDispenseChart data={data ?? []} />;
}

function UsageBySubjectWidget() {
  const { data, isLoading, error, refetch } = useUsageBySubject();
  if (isLoading) return <Skeleton className="h-[320px] w-full rounded-2xl" />;
  if (error) return <ChartError message={error.message} onRetry={() => refetch()} />;
  return <UsageBySubjectChart data={data ?? []} />;
}

function RepairStatusPanel() {
  const { data, isLoading, error, refetch } = useRepairStatus();
  if (isLoading) return <Skeleton className="h-[240px] w-full rounded-2xl" />;
  if (error) return <ChartError message={error.message} onRetry={() => refetch()} />;
  return <RepairStatusWidget data={data ?? { damaged: 0, underRepair: 0 }} />;
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-1">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

// One tab per DispenseType, because that is what decides which number means anything:
// a CONSUMABLE has flow and no per-piece status, an ITEM has per-piece status and no
// meaningful qty flow. Mixing all three into one page meant every widget was two-thirds
// noise — an asset-status pie counting สำลี alongside เครื่องวัดความดัน.
//
// No "ต้องดำเนินการ" section here on purpose. Every list that lived there (ใกล้หมด,
// คืนเกินกำหนด, เกินกำหนดซ่อมบำรุง) was a read-only top-5 whose predicate the routes
// themselves described as "same predicate as getAlertCounts" — /alerts renders the same
// rows with filters, pagination and panels that actually close the work. งานซ่อมที่กำลัง
// ดำเนินการ was the one non-duplicate, and /receive already owns it (SubItemStatusPanel
// status="UNDER_REPAIR"). DashboardAlertBar above the tabs carries the counts.
const TABS = [
  { type: "CONSUMABLE", label: "สิ้นเปลือง" },
  { type: "COUNT", label: "นับจำนวน" },
  { type: "ITEM", label: "ครุภัณฑ์รายชิ้น" },
] as const satisfies ReadonlyArray<{ type: DispenseType; label: string }>;

// Consumable and Count render the same shape — a lone SectionHeading divides nothing, so
// neither carries one; ItemPanel keeps its two because there it separates real groups.
function ConsumablePanel() {
  return (
    <div className="flex flex-col gap-4">
      <MovementChart />
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <TopDispenseWidget />
        <UsageBySubjectWidget />
      </div>
      <DashboardTables />
    </div>
  );
}

function CountPanel() {
  return (
    <div className="flex flex-col gap-4">
      <MovementChart />
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <TopDispenseWidget />
        <UsageBySubjectWidget />
      </div>
      <DashboardTables />
    </div>
  );
}

function ItemPanel() {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeading title="สถานะรายชิ้น" subtitle="ชิ้นงานทั้งหมดอยู่ในสถานะไหน" />
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <AssetStatusChart />
        <RepairStatusPanel />
      </div>

      <SectionHeading title="การใช้งาน" subtitle="ชิ้นที่ถูกยืมบ่อยและใช้ในวิชาไหน" />
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <TopDispenseWidget />
        <UsageBySubjectWidget />
      </div>
      <DashboardTables />
    </div>
  );
}

const PANELS: Record<DispenseType, ComponentType> = {
  CONSUMABLE: ConsumablePanel,
  COUNT: CountPanel,
  ITEM: ItemPanel,
};

export function DashboardBody() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL is the only state: a refresh, a back button or a shared link all land on the
  // same tab and the same filter. The old Tabs kept theirs in useState, so every refresh
  // snapped back to the first one.
  const parsed = parseScope(new URLSearchParams(searchParams.toString()));
  const type: DispenseType = parsed.type ?? "CONSUMABLE";
  const scope: DashboardScope = { ...parsed, type };
  const Panel = PANELS[type];

  const setScope = (next: DashboardScope) => {
    router.replace(`/${scopeQuery(next)}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Unscoped on purpose: this is the map of the whole warehouse, and it is how you
          pick which tab you actually want. */}
      <ProfileSummaryWidget />

      <Tabs value={type} onValueChange={(v) => setScope({ type: v as DispenseType })}>
        {/* The tab strip and its filters stay reachable while the panel below scrolls — the
            panels run several screens long and switching tab meant scrolling back up first.
            Negative margins let the bar bleed to the edge of main's padding so the blur
            covers what passes under it. */}
        {/* Offsets match the layout's own sticky Header (h-16 / sm:h-20). From lg up `main`
            is the scroll container and the header sits outside it, so there the bar sticks to
            main's own top edge instead. */}
        <div className="sticky top-16 z-30 -mx-4 flex flex-col gap-2.5 border-b bg-background/85 px-4 py-2.5 backdrop-blur-md sm:top-20 sm:-mx-6 sm:px-6 lg:top-0 lg:flex-row lg:items-center lg:gap-4">
          {/* w-full, not w-fit: the three tabs split the bar evenly so each is a wide target
              and the strip reads as the page's own segmented control rather than three chips
              floating at the left edge. TabsTrigger already carries flex-1. */}
          <TabsList className="w-full min-w-0">
            {TABS.map((t) => (
              <TabsTrigger key={t.type} value={t.type} className="min-w-0 px-3.5">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {/* shrink-0: without it the full-width TabsList squeezes the two selects until they
              wrap onto a second line and the sticky bar grows a row. */}
          <div className="shrink-0">
            <DashboardScopeBar
              type={type}
              profileId={scope.profileId}
              categoryId={scope.categoryId}
              onChange={(next) => setScope({ type, ...next })}
            />
          </div>
        </div>

        {TABS.map((t) => (
          <TabsContent key={t.type} value={t.type} className="animate-fade-in">
            {/* Only the active panel is mounted, so only its widgets fetch. */}
            <DashboardScopeProvider scope={scope}>
              <Panel />
            </DashboardScopeProvider>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
