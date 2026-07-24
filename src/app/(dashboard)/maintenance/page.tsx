"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { X, ClipboardList, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAINT_TYPE_LABELS, MAINT_RESULT_LABELS, labelFor, effectiveCode, type MaintenanceType, type MaintenanceResult } from "@/lib/constants";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { DashboardMetricCard } from "@/components/dashboard/dashboard-metric-card";
import { MaintenanceFormDialog } from "@/components/items/maintenance-form-dialog";
import { MaintenanceScheduleTab } from "@/components/reports/maintenance-schedule-tab";
import { getMaintenanceSummary, getReport } from "@/lib/api";
import { toast } from "sonner";

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

interface HistoryRow {
  id: string;
  itemCode: string;
  itemName: string;
  subCode: string | null;
  subCount: number;
  categoryName: string;
  type: string;
  result: string;
  issue: string;
  cost: number;
  performer: string;
  performedAt: string;
}

// ── Helpers ──

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

const SCHEDULE_VIEWS = [
  { value: "urgent", label: "รายการที่ต้องบำรุง", Icon: ClipboardList },
  { value: "full", label: "ตารางบำรุงรักษา", Icon: CalendarClock },
] as const;

// ── Page ──

export default function MaintenancePage() {
  const [summary, setSummary] = useState<Summary>({ overdue: 0, dueSoon: 0, completedThisMonth: 0 });
  const [scheduleItems, setScheduleItems] = useState<ScheduleRow[]>([]);
  const [recentRecords, setRecentRecords] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [schedulePage, setSchedulePage] = useState(1);
  const [filter, setFilter] = useState<"all" | "overdue" | "due-soon">("all");
  const [view, setView] = useState<"urgent" | "full">("urgent");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogItemId, setDialogItemId] = useState<string | undefined>();
  const [dialogItemLabel, setDialogItemLabel] = useState<string | undefined>();
  const [dialogCycle, setDialogCycle] = useState<number | undefined>();
  const [dialogSubItemId, setDialogSubItemId] = useState<string | undefined>();
  const [dialogSubLabel, setDialogSubLabel] = useState<string | undefined>();

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [sum, sched, hist] = await Promise.all([
        getMaintenanceSummary(),
        // ponytail: perPage 200 — covers overdue + due-soon set; bump if a tenant exceeds it.
        getReport("maintenance-schedule", { perPage: "200" }) as Promise<{ items: ScheduleRow[] }>,
        getReport("maintenance-history", { perPage: "5" }) as Promise<{ records: HistoryRow[] }>,
      ]);
      setSummary(sum);
      // Urgent set = overdue + due-soon (drives both the detailed tab and the sticky footer).
      const urgent = (sched.items ?? []).filter(
        (i) => i.maintenanceStatus === "overdue" || i.maintenanceStatus === "due-soon",
      );
      urgent.sort((a, b) => {
        if (a.maintenanceStatus === "overdue" && b.maintenanceStatus !== "overdue") return -1;
        if (a.maintenanceStatus !== "overdue" && b.maintenanceStatus === "overdue") return 1;
        return new Date(a.nextMaintenanceDate).getTime() - new Date(b.nextMaintenanceDate).getTime();
      });
      setScheduleItems(urgent);
      setRecentRecords(hist.records ?? []);
      setSchedulePage(1);
    } catch {
      if (!silent) toast.error("โหลดข้อมูลบำรุงรักษาไม่สำเร็จ");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

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
    setView("urgent");
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
      <div className="space-y-4 sm:space-y-8 pb-4">
        {/* ── Summary cards ── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <DashboardMetricCard
            title="เลยรอบ"
            value={summary.overdue}
            subtitle={filter === "overdue" ? "กดเพื่อยกเลิก" : summary.overdue > 0 ? "ต้องดำเนินการ" : undefined}
            iconName="Wrench"
            color="text-danger-500"
            onClick={summary.overdue > 0 ? () => toggleFilter("overdue") : undefined}
            active={filter === "overdue"}
          />
          <DashboardMetricCard
            title="ใกล้ถึงรอบ"
            value={summary.dueSoon}
            subtitle={filter === "due-soon" ? "กดเพื่อยกเลิก" : summary.dueSoon > 0 ? "ภายใน 30 วัน" : undefined}
            iconName="AlertTriangle"
            color="text-orange-500"
            onClick={summary.dueSoon > 0 ? () => toggleFilter("due-soon") : undefined}
            active={filter === "due-soon"}
          />
          <DashboardMetricCard
            title="บำรุงเดือนนี้"
            value={summary.completedThisMonth}
            subtitle="ครั้ง"
            iconName="CheckCircle2"
            color="text-success"
          />
        </div>

        {/* ── Segment tabs ── */}
        <section>
          <div className="mb-3 sm:mb-4 border-b">
            <nav className="flex gap-1 -mb-px overflow-x-auto">
              {SCHEDULE_VIEWS.map(({ value, label, Icon }) => {
                const isActive = view === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setView(value)}
                    className={cn(
                      "relative flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                    {isActive && (
                      <motion.span
                        layoutId="maintenance-view"
                        transition={{ type: "spring", stiffness: 450, damping: 35 }}
                        className="absolute -bottom-[2px] left-0 right-0 h-0.5 bg-primary"
                      />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {view === "full" ? (
            <MaintenanceScheduleTab />
          ) : (
            <>
              {filter !== "all" && (
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    {filter === "overdue" ? "เลยรอบ" : "ใกล้ถึงรอบ"}
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

              <div className="overflow-hidden rounded-2xl border bg-card">
                <div className="hidden md:block overflow-auto max-h-[50dvh] lg:max-h-[calc(100vh-420px)]">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow className="sticky top-0 z-10 border-b border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.08)] [&>th]:h-8 [&>th]:py-0 [&>th]:text-xs [&>th]:text-muted-foreground">
                        <TableHead className="w-36 px-2">รหัสพัสดุ</TableHead>
                        <TableHead className="px-2">ชื่อ</TableHead>
                        <TableHead className="w-24 px-2">สถานะ</TableHead>
                        <TableHead className="w-32 px-2">กำหนด</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 4 }).map((_, j) => (
                              <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : scheduleItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                            ไม่มีรายการที่เลยรอบหรือใกล้ถึงรอบ
                          </TableCell>
                        </TableRow>
                      ) : pagedSchedule.map((row) => {
                        const days = daysUntil(row.nextMaintenanceDate);
                        const isOverdue = row.maintenanceStatus === "overdue";
                        return (
                          <TableRow
                            key={row.id}
                            className="h-9 [&>td]:py-1"
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
                              <Badge variant={isOverdue ? "destructive" : "secondary"} className="px-1.5 py-0 leading-5 text-[11px]">
                                {isOverdue ? "เลยรอบ" : "ใกล้ถึงรอบ"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs px-2">
                              <div className="flex flex-col gap-0.5">
                                <span className="tabular-nums">
                                  {new Date(row.nextMaintenanceDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                                </span>
                                <span className={isOverdue ? "text-destructive text-xs" : "text-amber-600 dark:text-amber-400 text-xs"}>
                                  {isOverdue ? `เกิน ${Math.abs(days)} วัน` : `อีก ${days} วัน`}
                                </span>
                              </div>
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
                  ) : scheduleItems.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">ไม่มีรายการที่เลยรอบหรือใกล้ถึงรอบ</div>
                  ) : pagedSchedule.map((row) => {
                    const days = daysUntil(row.nextMaintenanceDate);
                    const isOverdue = row.maintenanceStatus === "overdue";
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
                          <Badge variant={isOverdue ? "destructive" : "secondary"} className="shrink-0">
                            {isOverdue ? "เลยรอบ" : "ใกล้ถึงรอบ"}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <Link href={`/items/${row.itemId}`} className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline">{row.code}</Link>
                          <span className="flex items-center gap-1.5 tabular-nums">
                            {new Date(row.nextMaintenanceDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                            <span className={isOverdue ? "text-destructive text-xs" : "text-amber-600 dark:text-amber-400 text-xs"}>
                              ({isOverdue ? `เกิน ${Math.abs(days)} วัน` : `อีก ${days} วัน`})
                            </span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!loading && filteredSchedule.length > 0 && (
                  <div className="flex items-center justify-between gap-4 border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                    <span>แสดง {filteredSchedule.length} รายการ</span>
                    {/* ponytail: reserved slot for future pagination */}
                  </div>
                )}
              </div>

              {!loading && filteredSchedule.length > PAGE_SIZE.COMPACT && (
                <Pagination
                  page={schedulePage}
                  total={filteredSchedule.length}
                  pageSize={PAGE_SIZE.COMPACT}
                  onChange={setSchedulePage}
                />
              )}

              {/* ponytail: removed urgent-items pill list — duplicated table rows, no purpose. Count summary moved into the card footer above. */}
            </>
          )}
        </section>

        {/* ── Recent records ── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">บันทึกล่าสุด</h2>
            <Link href="/reports?tab=maintenance-history" className="text-sm text-primary hover:underline">
              ดูทั้งหมดในรายงาน →
            </Link>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : recentRecords.length === 0 ? (
            <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
              ยังไม่มีบันทึกการซ่อมบำรุง
            </div>
          ) : (
            <div className="space-y-2">
              {recentRecords.map((rec, idx) => (
                <div
                  key={rec.id}
                  className={cn(
                    "rounded-lg border bg-card p-3",
                    idx % 2 === 1 && "bg-muted/20",
                  )}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {labelFor(MAINT_TYPE_LABELS, rec.type as MaintenanceType)}
                    </Badge>
                    <Badge variant={rec.result === "AVAILABLE" ? "default" : "secondary"} className="text-xs">
                      {labelFor(MAINT_RESULT_LABELS, rec.result as MaintenanceResult)}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(rec.performedAt).toLocaleDateString("th-TH")}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="mr-2 font-mono text-xs text-muted-foreground">{effectiveCode(rec.itemCode, rec.subCode, rec.subCount)}</span>
                    <span className="font-medium">{rec.itemName}</span>
                  </div>
                  {rec.issue && <p className="mt-0.5 text-sm text-muted-foreground">{rec.issue}</p>}
                  <div className="mt-1 text-xs text-muted-foreground">
                    โดย {rec.performer}{rec.cost > 0 ? ` · ฿${rec.cost.toLocaleString()}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
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
