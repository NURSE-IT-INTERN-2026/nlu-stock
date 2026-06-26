"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/dashboard/pagination";
import { DashboardMetricCard } from "@/components/dashboard/dashboard-metric-card";
import { MaintenanceFormDialog } from "@/components/items/maintenance-form-dialog";
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
  code: string;
  name: string;
  model: string;
  categoryName: string;
  location: string;
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  maintenanceCycleMonths: number;
  maintenanceStatus: string;
}

interface HistoryRow {
  id: string;
  itemCode: string;
  itemName: string;
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

const RESULT_LABELS: Record<string, string> = {
  AVAILABLE: "พร้อมใช้งาน",
  NEEDS_MORE_REPAIR: "ต้องซ่อมเพิ่ม",
  DISPOSED: "จำหน่าย",
};

const TYPE_LABELS: Record<string, string> = {
  PREVENTIVE: "ป้องกัน",
  CORRECTIVE: "ซ่อมแก้ไข",
};

const PAGE_SIZE = 10;

// ── Page ──

export default function MaintenancePage() {
  const [summary, setSummary] = useState<Summary>({ overdue: 0, dueSoon: 0, completedThisMonth: 0 });
  const [scheduleItems, setScheduleItems] = useState<ScheduleRow[]>([]);
  const [recentRecords, setRecentRecords] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [schedulePage, setSchedulePage] = useState(1);
  const [filter, setFilter] = useState<"all" | "overdue" | "due-soon">("all");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogItemId, setDialogItemId] = useState<string | undefined>();
  const [dialogItemLabel, setDialogItemLabel] = useState<string | undefined>();
  const [dialogCycle, setDialogCycle] = useState<number | undefined>();

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
      // Filter to only overdue + due-soon
      const urgent = (sched.items ?? []).filter(
        (i) => i.maintenanceStatus === "overdue" || i.maintenanceStatus === "due-soon",
      );
      // Sort: overdue first, then by nextMaintenanceDate asc
      urgent.sort((a, b) => {
        if (a.maintenanceStatus === "overdue" && b.maintenanceStatus !== "overdue") return -1;
        if (a.maintenanceStatus !== "overdue" && b.maintenanceStatus === "overdue") return 1;
        return new Date(a.nextMaintenanceDate).getTime() - new Date(b.nextMaintenanceDate).getTime();
      });
      setScheduleItems(urgent);
      setRecentRecords(hist.records ?? []);
      setSchedulePage(1);
    } catch {
      if (!silent) toast.error("Failed to load maintenance data");
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
  const pagedSchedule = filteredSchedule.slice((schedulePage - 1) * PAGE_SIZE, schedulePage * PAGE_SIZE);

  const toggleFilter = (target: "overdue" | "due-soon") => {
    setFilter((f) => (f === target ? "all" : target));
    setSchedulePage(1);
  };

  const clearFilter = () => {
    setFilter("all");
    setSchedulePage(1);
  };

  const openRecordDialog = (itemId?: string, itemLabel?: string, cycle?: number) => {
    setDialogItemId(itemId);
    setDialogItemLabel(itemLabel);
    setDialogCycle(cycle);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-8 pb-20">
      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

      {/* ── Overdue + Due-soon table ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">รายการที่ต้องบำรุง</h2>
          {!loading && filteredSchedule.length > 0 && (
            <span className="text-sm text-muted-foreground">{filteredSchedule.length} รายการ</span>
          )}
        </div>

        {filter !== "all" && (
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {filter === "overdue" ? "เลยรอบ" : "ใกล้ถึงรอบ"}
              <button
                type="button"
                onClick={clearFilter}
                aria-label="ล้างตัวกรอง"
                className="-mr-1 ml-0.5 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
            <button
              type="button"
              onClick={clearFilter}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              ล้างตัวกรอง
            </button>
          </div>
        )}

        <div className="rounded-2xl border overflow-hidden bg-card">
          <div className="overflow-auto max-h-[58dvh] lg:max-h-[calc(100vh-360px)]">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 z-10 bg-card border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                  <TableHead>รหัสพัสดุ</TableHead>
                  <TableHead>ชื่อ</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>กำหนด</TableHead>
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
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      ไม่มีรายการที่เลยรอบหรือใกล้ถึงรอบ
                    </TableCell>
                  </TableRow>
                ) : pagedSchedule.map((row) => {
                  const days = daysUntil(row.nextMaintenanceDate);
                  const isOverdue = row.maintenanceStatus === "overdue";
                  const open = () => openRecordDialog(row.id, `${row.code} – ${row.name}`, row.maintenanceCycleMonths);
                  return (
                    <TableRow
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      onClick={open}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          open();
                        }
                      }}
                      aria-label={`${row.code} ${row.name}, ${isOverdue ? `เลยรอบ เกิน ${Math.abs(days)} วัน` : `ใกล้ถึงรอบ อีก ${days} วัน`}`}
                      className="cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none transition-colors"
                    >
                      <TableCell className="font-mono text-xs">{row.code}</TableCell>
                      <TableCell>
                        <Link
                          href={`/items/${row.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline font-medium"
                        >
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={isOverdue ? "destructive" : "secondary"}>
                          {isOverdue ? "เลยรอบ" : "ใกล้ถึงรอบ"}
                        </Badge>
                      </TableCell>
                      <TableCell>
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
        </div>

        {!loading && filteredSchedule.length > PAGE_SIZE && (
          <div className="mt-3">
            <Pagination
              page={schedulePage}
              total={filteredSchedule.length}
              pageSize={PAGE_SIZE}
              onChange={setSchedulePage}
            />
          </div>
        )}
      </section>

      {/* ── Recent records ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
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
                  "p-3 rounded-lg border bg-card",
                  idx % 2 === 1 && "bg-muted/20",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">
                    {TYPE_LABELS[rec.type] || rec.type}
                  </Badge>
                  <Badge variant={rec.result === "AVAILABLE" ? "default" : "secondary"} className="text-xs">
                    {RESULT_LABELS[rec.result] || rec.result}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(rec.performedAt).toLocaleDateString("th-TH")}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="font-mono text-xs text-muted-foreground mr-2">{rec.itemCode}</span>
                  <span className="font-medium">{rec.itemName}</span>
                </div>
                {rec.issue && <p className="text-sm text-muted-foreground mt-0.5">{rec.issue}</p>}
                <div className="text-xs text-muted-foreground mt-1">
                  โดย {rec.performer}{rec.cost > 0 ? ` · ฿${rec.cost.toLocaleString()}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Floating Action Button ── */}
      <button
        type="button"
        onClick={() => openRecordDialog()}
        className={cn(
          "fixed right-6 z-40",
          "bottom-24 md:bottom-8",
          "inline-flex items-center gap-2 rounded-full px-5 py-3",
          "bg-primary text-primary-foreground shadow-lg",
          "hover:bg-primary/90 hover:shadow-xl hover:-translate-y-0.5",
          "active:translate-y-0 active:shadow-md",
          "transition-all",
        )}
      >
        <Plus className="h-4 w-4" />
        <span className="text-sm font-semibold">บันทึกการบำรุงรักษา</span>
      </button>

      {/* ── Dialog ── */}
      <MaintenanceFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        itemId={dialogItemId}
        itemLabel={dialogItemLabel}
        maintenanceCycleMonths={dialogCycle}
        onSuccess={fetchData}
      />
    </div>
  );
}
