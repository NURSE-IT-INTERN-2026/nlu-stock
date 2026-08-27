"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { fmtDate, TH_DATE } from "@/lib/format";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, History, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { DashboardMetricCard } from "@/components/dashboard/dashboard-metric-card";
import { MaintenanceFormDialog } from "@/components/items/maintenance-form-dialog";
import { ReportFilters, type FilterValues } from "@/components/reports/report-filters";
import { ExportButtons } from "@/components/reports/export-buttons";
import { getMaintenanceSummary, getReport } from "@/lib/api";
import { toast } from "sonner";

import { usePageHeader } from "@/components/layout/page-header-context";
import { CaseWorkspace } from "@/components/cases/case-workspace";
// ── Types ──

interface Summary {
  overdue: number;
  dueSoon: number;
  completedThisMonth: number;
}

interface ScheduleRow {
  id: string;
  itemId: string;
  subItemId: string | null;
  subCode: string | null;
  code: string; // already formatted per-copy (effectiveCode) by the server
  name: string;
  model: string;
  categoryName: string;
  location: string;
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  maintenanceCycleMonths: number;
  maintenanceStatus: string;
  subItemStatus: string | null;
}

// ── Helpers ──

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function fmtThaiDate(dateStr: string): string {
  return fmtDate(dateStr, TH_DATE);
}

// สถานะกำหนดบำรุง (คำนวณฝั่ง server ใน /api/reports/maintenance-schedule)
// ปกติ = outline เพื่อให้เงียบที่สุด — แถวส่วนใหญ่เป็นค่านี้
const STATUS_META = {
  overdue: { label: "เกินกำหนดซ่อมบำรุง", variant: "destructive", tone: "text-destructive" },
  "due-soon": { label: "ใกล้ถึงกำหนดซ่อมบำรุง", variant: "secondary", tone: "text-amber-600 dark:text-amber-400" },
  normal: { label: "ปกติ", variant: "outline", tone: "text-muted-foreground" },
} as const satisfies Record<string, { label: string; variant: "destructive" | "secondary" | "outline"; tone: string }>;

function statusMeta(status: string) {
  return STATUS_META[status as keyof typeof STATUS_META] ?? STATUS_META.normal;
}

// ── Page ──

// ภาพรวม (กำหนดการตามรอบ) · ประวัติ (รอบที่ทำไปแล้ว). Both halves of ONE question: อะไรถึงรอบ
// บำรุงรักษาเมื่อไหร่. ของพัง/ค้างซ่อมเป็นคนละคำถาม และอยู่ที่ /repairs — เอามาปนกันแล้วผู้ใช้ที่มา
// ด้วย intent เดียวต้องอ่านผ่านอีก intent หนึ่งทุกครั้ง.
type MaintTab = "overview" | "history";

const MAINT_TABS = [
  { value: "overview", label: "ภาพรวม", icon: ClipboardList },
  { value: "history", label: "ประวัติการบำรุงรักษา", icon: History },
] as const;

export default function MaintenancePage() {
  return (
    <Suspense>
      <MaintenanceShell />
    </Suspense>
  );
}

function MaintenanceShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: MaintTab = MAINT_TABS.some((t) => t.value === rawTab) ? (rawTab as MaintTab) : "overview";
  const changeTab = (value: MaintTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.replace(`/maintenance?${params.toString()}`, { scroll: false });
  };
  const { setDetail } = usePageHeader();
  const activeLabel = MAINT_TABS.find((t) => t.value === tab)?.label;
  useEffect(() => {
    setDetail(activeLabel ?? null);
    return () => setDetail(null);
  }, [activeLabel, setDetail]);

  const [summary, setSummary] = useState<Summary>({ overdue: 0, dueSoon: 0, completedThisMonth: 0 });
  const [scheduleItems, setScheduleItems] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [schedulePage, setSchedulePage] = useState(1);
  const [filter, setFilter] = useState<"all" | "overdue" | "due-soon">("all");
  const [filters, setFilters] = useState<FilterValues>({});

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogItemId, setDialogItemId] = useState<string | undefined>();
  const [dialogItemLabel, setDialogItemLabel] = useState<string | undefined>();
  const [dialogCycle, setDialogCycle] = useState<number | undefined>();
  const [dialogSubItemId, setDialogSubItemId] = useState<string | undefined>();
  const [dialogSubLabel, setDialogSubLabel] = useState<string | undefined>();

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    // ponytail: perPage 200 — covers the whole schedule; bump if a tenant exceeds it.
    const params: Record<string, string> = { perPage: "200" };
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.locationId) params.locationId = filters.locationId;
    try {
      const [sum, sched] = await Promise.all([
        getMaintenanceSummary(),
        getReport("maintenance-schedule", params) as Promise<{ items: ScheduleRow[] }>,
      ]);
      setSummary(sum);
      // ทั้งตาราง เรียงตามกำหนดบำรุงเก่า→ใหม่ (API sort ให้แล้ว)
      setScheduleItems(sched.items ?? []);
      setSchedulePage(1);
    } catch {
      if (!silent) toast.error("โหลดข้อมูลบำรุงรักษาไม่สำเร็จ");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredSchedule = filter === "all"
    ? scheduleItems
    : scheduleItems.filter((i) => i.maintenanceStatus === filter);
  const pagedSchedule = filteredSchedule.slice((schedulePage - 1) * PAGE_SIZE.COMPACT, schedulePage * PAGE_SIZE.COMPACT);

  const toggleFilter = (target: "overdue" | "due-soon") => {
    setFilter((f) => (f === target ? "all" : target));
    setSchedulePage(1);
  };

  const clearFilter = () => {
    setFilter("all");
    setSchedulePage(1);
  };

  const openRecordDialog = (row: ScheduleRow) => {
    setDialogItemId(row.itemId);
    setDialogItemLabel(`${row.code} – ${row.name}`);
    setDialogCycle(row.maintenanceCycleMonths);
    // Tracked copy → record against that specific piece; the dialog shows the "ชิ้น:" row.
    setDialogSubItemId(row.subItemId ?? undefined);
    setDialogSubLabel(row.subItemId ? row.code : undefined);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col">
      {/* ── Tabs ── */}
      <div className="border-b mb-4 sm:mb-6 -mx-4 px-4 sm:-mx-6 sm:px-6">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {MAINT_TABS.map(({ value, label, icon: Icon }) => {
            const isActive = tab === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => changeTab(value)}
                className={cn(
                  "relative flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
                {isActive && (
                  <motion.span
                    layoutId="maintenance-tab"
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                    className="absolute -bottom-[2px] left-0 right-0 h-0.5 bg-primary"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className={cn("space-y-4 sm:space-y-8 pb-4", tab !== "overview" && "hidden")}>
        {/* ── Summary cards ── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <DashboardMetricCard
            title="เกินกำหนดซ่อมบำรุง"
            value={summary.overdue}
            subtitle={filter === "overdue" ? "กดเพื่อยกเลิก" : summary.overdue > 0 ? "ต้องดำเนินการ" : undefined}
            iconName="Wrench"
            color="text-danger-500"
            onClick={summary.overdue > 0 ? () => toggleFilter("overdue") : undefined}
            active={filter === "overdue"}
          />
          <DashboardMetricCard
            title="ใกล้ถึงกำหนดซ่อมบำรุง"
            value={summary.dueSoon}
            subtitle={filter === "due-soon" ? "กดเพื่อยกเลิก" : summary.dueSoon > 0 ? "ภายใน 30 วัน" : undefined}
            iconName="AlertTriangle"
            color="text-orange-500"
            onClick={summary.dueSoon > 0 ? () => toggleFilter("due-soon") : undefined}
            active={filter === "due-soon"}
          />
          <DashboardMetricCard
            title="กำหนดการซ่อมบำรุงเดือนนี้"
            value={summary.completedThisMonth}
            subtitle="รายการ"
            iconName="CheckCircle2"
            color="text-success"
          />
        </div>

        {/* ── ตารางบำรุงรักษา ── */}
        {/* หัวเรื่อง ตัวกรอง ตาราง แบ่งหน้า = การ์ดใบเดียว ไม่ใช่สามก้อนลอยบนพื้นหลัง */}
        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="mb-3 text-lg font-semibold">ตารางบำรุงรักษา</h2>

            <ReportFilters
              config={{ dateRange: true, locations: true }}
              values={filters}
              onChange={setFilters}
              actions={<ExportButtons reportType="maintenance-schedule" filters={filters} />}
              className="rounded-none border-0 bg-transparent p-0 sm:p-0"
            />

          {filter !== "all" && (
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {filter === "overdue" ? "เกินกำหนดซ่อมบำรุง" : "ใกล้ถึงกำหนดซ่อมบำรุง"}
                <button
                  type="button"
                  onClick={clearFilter}
                  aria-label="ล้างตัวกรอง"
                  className="-mr-1 ml-0.5 rounded-full p-0.5 transition-colors hover:bg-primary/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
              <button
                type="button"
                onClick={clearFilter}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                ล้างตัวกรอง
              </button>
            </div>
          )}
          </div>

          <div>
            {/* คอลัมน์แรก/สุดท้ายเว้น 16px เท่าหัวเรื่อง ตัวกรอง และแถบแบ่งหน้า */}
            <div className="hidden md:block overflow-auto max-h-[50dvh] lg:max-h-[calc(100vh-420px)] [&_tr>*:first-child]:pl-4 [&_tr>*:last-child]:pr-4">
              <Table grid zebra className="table-fixed">
                <TableHeader sticky>
                  <TableRow>
                    <TableHead className="w-36 px-2">รหัสพัสดุ</TableHead>
                    <TableHead className="px-2">ชื่อ</TableHead>
                    <TableHead className="w-40 px-2">สถานะ</TableHead>
                    <TableHead className="w-24 px-2">จำนวนวัน</TableHead>
                    <TableHead className="w-36 px-2">กำหนดการซ่อมบำรุง</TableHead>
                    <TableHead className="w-40 px-2">สถานที่</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredSchedule.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        ไม่พบรายการตามตัวกรอง
                      </TableCell>
                    </TableRow>
                  ) : pagedSchedule.map((row) => {
                    const days = daysUntil(row.nextMaintenanceDate);
                    const meta = statusMeta(row.maintenanceStatus);
                    return (
                      <TableRow
                        key={row.id}
                      >
                        {/* รหัส → ลิงก์ไปหน้าพัสดุ. ชื่อ → ปุ่มบันทึกบำรุง (target แค่ชื่อ ไม่ทั้งแถว) */}
                        <TableCell className="font-mono text-xs px-2">
                          <Link href={`/items/${row.itemId}`} className="block truncate text-muted-foreground hover:text-foreground hover:underline">{row.code}</Link>
                        </TableCell>
                        <TableCell className="px-2">
                          <button
                            type="button"
                            onClick={() => openRecordDialog(row)}
                            aria-label={`บันทึกบำรุงรักษา ${row.code} ${row.name}`}
                            className="block w-full truncate text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none cursor-pointer"
                          >
                            {row.name}
                          </button>
                        </TableCell>
                        <TableCell className="px-2">
                          <Badge variant={meta.variant} className="px-1.5 py-0 leading-5 text-[11px]">
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className={cn("text-xs px-2 tabular-nums", meta.tone)}>
                          {days < 0 ? `เกิน ${Math.abs(days)} วัน` : `อีก ${days} วัน`}
                        </TableCell>
                        <TableCell className="text-xs px-2 tabular-nums">
                          {fmtThaiDate(row.nextMaintenanceDate)}
                        </TableCell>
                        <TableCell className="px-2 text-xs text-muted-foreground">
                          <span className="block truncate" title={row.location}>{row.location || "—"}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile: stacked cards (no horizontal scroll) */}
            <div className="divide-y divide-border md:hidden">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-4 py-2.5"><Skeleton className="h-10 w-full" /></div>
                ))
              ) : filteredSchedule.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">ไม่พบรายการตามตัวกรอง</div>
              ) : pagedSchedule.map((row) => {
                const days = daysUntil(row.nextMaintenanceDate);
                const meta = statusMeta(row.maintenanceStatus);
                return (
                  <div key={row.id} className="flex flex-col gap-1.5 px-4 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      {/* ชื่อ = ปุ่มบันทึกบำรุง (target แค่ชื่อ) */}
                      <button
                        type="button"
                        onClick={() => openRecordDialog(row)}
                        aria-label={`บันทึกบำรุงรักษา ${row.code} ${row.name}`}
                        className="min-w-0 text-left font-medium leading-tight hover:underline focus-visible:underline focus-visible:outline-none"
                      >
                        {row.name}
                      </button>
                      <Badge variant={meta.variant} className="shrink-0">
                        {meta.label}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <Link href={`/items/${row.itemId}`} className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline">{row.code}</Link>
                      <span className="flex items-center gap-1.5 tabular-nums">
                        {fmtThaiDate(row.nextMaintenanceDate)}
                        <span className={cn("text-xs", meta.tone)}>
                          ({days < 0 ? `เกิน ${Math.abs(days)} วัน` : `อีก ${days} วัน`})
                        </span>
                      </span>
                    </div>
                    {row.location && (
                      <div className="text-xs text-muted-foreground">{row.location}</div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* นับรวม + แบ่งหน้าอยู่ในกล่องเดียวกับตาราง ไม่ลอยอยู่บนพื้นหลังหน้า */}
            {!loading && filteredSchedule.length > 0 && (
              <Pagination
                page={schedulePage}
                total={filteredSchedule.length}
                pageSize={PAGE_SIZE.COMPACT}
                onChange={setSchedulePage}
              />
            )}
          </div>

          {/* ponytail: removed urgent-items pill list — duplicated table rows, no purpose. */}
        </section>

      </div>

      {/* ตรวจบำรุงตามรอบ only — ซ่อมแซม answers the other page's question and lives at
          /repairs?tab=history. Both tabs are the same workspace as /cases, reading the same
          source: แท็บภาพรวมข้างบนคือ "ถึงรอบเมื่อไหร่" (สิ่งที่ต้องทำ), แท็บนี้คือ "ทำอะไรไปแล้ว". */}
      <div className={cn("space-y-4 sm:space-y-8 pb-4", tab !== "history" && "hidden")}>
        {tab === "history" && <CaseWorkspace lockType="MAINTENANCE" />}
      </div>

      {/* ── Dialog ── */}
      <MaintenanceFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        itemId={dialogItemId}
        itemLabel={dialogItemLabel}
        subItemId={dialogSubItemId}
        subItemLabel={dialogSubLabel}
        maintenanceCycleMonths={dialogCycle}
        onSuccess={fetchData}
      />
    </div>
  );
}

