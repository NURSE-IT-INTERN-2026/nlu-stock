"use client";

import { useState, useEffect, useCallback } from "react";
import { fmtDate, TH_DATE, TH_DATETIME, TH_DAY } from "@/lib/format";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAINT_TYPE_LABELS, MAINT_RESULT_LABELS, labelFor, effectiveCode, type MaintenanceType, type MaintenanceResult } from "@/lib/constants";
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

export default function MaintenancePage() {
  const [summary, setSummary] = useState<Summary>({ overdue: 0, dueSoon: 0, completedThisMonth: 0 });
  const [scheduleItems, setScheduleItems] = useState<ScheduleRow[]>([]);
  const [recentRecords, setRecentRecords] = useState<HistoryRow[]>([]);
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
      const [sum, sched, hist] = await Promise.all([
        getMaintenanceSummary(),
        getReport("maintenance-schedule", params) as Promise<{ items: ScheduleRow[] }>,
        getReport("maintenance-history", { perPage: "5" }) as Promise<{ records: HistoryRow[] }>,
      ]);
      setSummary(sum);
      // ทั้งตาราง เรียงตามกำหนดบำรุงเก่า→ใหม่ (API sort ให้แล้ว)
      setScheduleItems(sched.items ?? []);
      setRecentRecords(hist.records ?? []);
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
      <div className="space-y-4 sm:space-y-8 pb-4">
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
        <section>
          <h2 className="mb-3 text-lg font-semibold sm:mb-4">ตารางบำรุงรักษา</h2>

          <div className="mb-3 sm:mb-4">
            <ReportFilters
              config={{ dateRange: true, locations: true }}
              values={filters}
              onChange={setFilters}
              actions={<ExportButtons reportType="maintenance-schedule" filters={filters} />}
            />
          </div>

          {filter !== "all" && (
            <div className="mb-3 flex items-center gap-2">
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

          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="hidden md:block overflow-auto max-h-[50dvh] lg:max-h-[calc(100vh-420px)]">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 border-b border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.08)] [&>th]:h-8 [&>th]:py-0 [&>th]:text-xs [&>th]:text-muted-foreground">
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
        </section>

        {/* ── Recent records ── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">บันทึกการบำรุงรักษาล่าสุด</h2>
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
                      {fmtDate(rec.performedAt, TH_DATE)}
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
