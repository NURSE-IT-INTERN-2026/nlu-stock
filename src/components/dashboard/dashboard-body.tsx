"use client";

import type { ComponentType } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardScopeBar } from "./dashboard-scope-bar";
import { DashboardTables } from "./dashboard-charts";
import { DispenseByUsageChart } from "./dispense-by-usage-chart";
import { TopDispenseChart } from "./top-dispense-chart";
import { TopCoursesChart } from "./top-courses-chart";
import { LoanKpis, InUseKpis } from "./tab-kpis";
import { FlowMonthlyChart } from "./flow-monthly-chart";
import { LoanDurationChart } from "./loan-duration-chart";
import { OutstandingLoansTable } from "./outstanding-loans-table";
import { AssetStatusChart } from "./asset-status-chart";
import { StationByRoomChart } from "./station-by-room-chart";
import { InUseTable } from "./in-use-table";
import { ProfileSummaryWidget } from "./profile-summary-widget";
import { DashboardScopeProvider } from "@/hooks/use-dashboard-scope";
import { parseScope, scopeQuery, type DashboardScope } from "@/lib/dashboard-scope";
import type { DispenseKind } from "@/lib/dispense-kind";
import { useTopDispense } from "@/hooks/use-dashboard-queries";

function ChartError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-[320px] flex-col items-center justify-center gap-2 rounded-2xl border bg-card">
      <p className="text-sm text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary"
      >
        โหลดใหม่
      </button>
    </div>
  );
}

// TopDispenseChart takes rows, not a scope — the fetch lives here so the same ranked list
// serves all three tabs, each scoped to its own kind by the provider it sits under. `verb`
// is what makes the heading true per tab: the ยืม tab counts loans, not เบิก.
function TopDispenseWidget({ verb }: { verb: string }) {
  const { data, isLoading, error, refetch } = useTopDispense();
  if (isLoading) return <Skeleton className="h-[320px] w-full rounded-2xl" />;
  if (error) return <ChartError message={error.message} onRetry={() => refetch()} />;
  return <TopDispenseChart data={data ?? []} verb={verb} />;
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-1">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

// One tab per DispenseKind, because that is what decides which number means anything:
// เบิกใช้ never comes back so it has flow but no "ยังไม่คืน", ยืม has a due date and someone
// to chase, นำไปใช้งาน has a room and no due date at all. Mixing all three into one page meant
// every widget was two-thirds noise. The kind axis is lib/dispense-kind's, reused so /reports
// and the dashboard can never disagree on what "ยืม" counts.
//
// No "ต้องดำเนินการ" section on purpose: every list that lived there (ใกล้หมด, คืนเกินกำหนด,
// เกินกำหนดซ่อมบำรุง) is a read-only top-5 whose predicate is "same as getAlertCounts" —
// DashboardAlertBar above the tabs carries the counts and /alerts closes the work.
const TABS = [
  { kind: "consume", label: "สิ้นเปลือง" },
  { kind: "borrow", label: "สถิติการยืม" },
  { kind: "inuse", label: "สถิติการนำไปใช้งาน" },
] as const satisfies ReadonlyArray<{ kind: DispenseKind; label: string }>;

// เบิกใช้: flow and รายวิชา, the two questions a consumable answers.
function ConsumePanel() {
  return (
    <div className="flex flex-col gap-4">
      <DispenseByUsageChart />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <TopDispenseWidget verb="เบิก" />
        <TopCoursesChart />
      </div>
      <DashboardTables />
    </div>
  );
}

// ยืม: the loop — ออกไปเท่าไร กลับมาเท่าไร นานแค่ไหน ค้างอะไรอยู่. KPIs count things, the flow
// and the histogram count events, and the worklist is what someone acts on today.
function BorrowPanel() {
  return (
    <div className="flex flex-col gap-4">
      <LoanKpis />
      <FlowMonthlyChart
        title="แนวโน้มการยืม-คืน"
        hint="ยืมออกเทียบกับคืนเข้า และยอดค้าง ณ สิ้นเดือน ย้อนหลัง 1 ปี (ชิ้น)"
        gapLabel="ค้างสะสม"
        outLabel="ยืมออก"
        backLabel="คืนเข้า"
      />
      {/* Three narrow widgets in one row rather than a pair plus an orphan. Every one of them
          is a short list of labelled bars — two ranked lists and a four-bucket histogram — and
          whichever is left over at full width stretches its bars across 1136px with a lane of
          dead space in the middle. Only แนวโน้ม (12 months) and รายการค้างคืน (five columns)
          have content that uses the whole row. */}
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
        <TopDispenseWidget verb="ยืม" />
        <TopCoursesChart verb="ยืม" />
        <LoanDurationChart />
      </div>
      <OutstandingLoansTable />
    </div>
  );
}

// นำไปใช้งาน: สถานะ and ที่ตั้ง, not flow of qty — a durable is drawn once and lives somewhere
// for a term. สถานะรายชิ้น leads (donut), then where it went and what for.
function InUsePanel() {
  return (
    <div className="flex flex-col gap-4">
      <InUseKpis />
      {/* Full width, alone: the 260px trend is the tallest widget on the tab, so anything
          beside it stretches to its height and shows a band of empty space. */}
      <FlowMonthlyChart
        title="แนวโน้มการนำไปใช้งาน-นำกลับ"
        hint="นำออกใช้งานเทียบกับนำกลับคลัง และยอดค้าง ณ สิ้นเดือน ย้อนหลัง 1 ปี (ชิ้น)"
        gapLabel="ค้างสะสม"
        outLabel="นำออก"
        backLabel="นำกลับ"
      />
      <SectionHeading title="สถานะและที่ตั้ง" subtitle="ชิ้นงานอยู่ในสถานะไหน และกระจายอยู่ห้องไหน" />
      {/* items-start, not stretch: the donut card is the one thing here that must not grow to
          a neighbour's height — a stretched card spreads its five legend rows down a blank
          column. The two list cards below pair off instead, where equal row counts make them
          match on their own. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <AssetStatusChart />
        <StationByRoomChart />
      </div>
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <InUseTable />
        <TopDispenseWidget verb="นำไปใช้งาน" />
      </div>
    </div>
  );
}

const PANELS: Record<DispenseKind, ComponentType> = {
  consume: ConsumePanel,
  borrow: BorrowPanel,
  inuse: InUsePanel,
};

export function DashboardBody() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL is the only state: a refresh, a back button or a shared link all land on the
  // same tab and the same filter. Keeping it in useState would snap every refresh back to
  // the first tab.
  const scope = parseScope(new URLSearchParams(searchParams.toString()));
  const kind = scope.kind;
  const Panel = PANELS[kind];

  const setScope = (next: DashboardScope) => {
    router.replace(`/${scopeQuery(next)}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Unscoped map of the whole warehouse, above the tabs on purpose: it is how you pick
          which tab you actually want, so it cannot depend on the one you are on. */}
      <ProfileSummaryWidget />

      {/* Switching tab drops ประเภท/หมวดย่อย: a profile belongs to one kind's DispenseTypes,
          so carrying it into another tab would filter to nothing. */}
      <Tabs value={kind} onValueChange={(v) => setScope({ kind: v as DispenseKind })}>
        {/* The tab strip and its filters stay reachable while the panel below scrolls — the
            panels run several screens long and switching tab meant scrolling back up first.
            Offsets match the layout's own sticky Header (h-16 / sm:h-20); from lg up `main`
            is the scroll container and the header sits outside it, so there the bar sticks to
            main's own top edge instead. */}
        <div className="sticky top-16 z-30 -mx-4 flex flex-col gap-2.5 border-b bg-background/85 px-4 py-2.5 backdrop-blur-md sm:top-20 sm:-mx-6 sm:px-6 lg:top-0 lg:flex-row lg:items-center lg:gap-4">
          {/* w-full, not w-fit: the three tabs split the bar evenly so each is a wide target
              and the strip reads as the page's own segmented control.
              shrink-0 คู่กับ flex-1 ของ base: จอกว้างแบ่งเท่าๆ กัน จอแคบดันรางให้เลื่อน แทนที่จะบีบ
              จนป้ายล้น — "สถิติการนำไปใช้งาน" ต้องการ 120px แต่ได้ช่อง 112px ที่จอ 375
              justify-start ทับ justify-center ของ base เหมือนที่ variant segment ทำ: flex ที่
              justify-center แล้วเนื้อในล้น จะดันส่วนเกินออกทั้งสองข้างเท่าๆ กัน ฝั่งซ้ายที่ล้นออกไป
              เลื่อนกลับมาไม่ได้ (scrollLeft ติดลบไม่ได้) — แท็บแรกหายจากจอถาวรทั้งที่ scrollLeft = 0 */}
          <TabsList className="w-full min-w-0 justify-start overflow-x-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.kind} value={t.kind} className="shrink-0 px-3.5">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {/* shrink-0: without it the full-width TabsList squeezes the selects until they
              wrap onto a second line and the sticky bar grows a row. */}
          <div className="shrink-0">
            <DashboardScopeBar
              kind={kind}
              profileId={scope.profileId}
              categoryId={scope.categoryId}
              onChange={(next) => setScope({ kind, ...next })}
            />
          </div>
        </div>

        {TABS.map((t) => (
          <TabsContent key={t.kind} value={t.kind} className="animate-fade-in">
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
