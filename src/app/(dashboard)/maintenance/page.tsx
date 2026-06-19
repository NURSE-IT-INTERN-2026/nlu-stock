"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
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

// ── Page ──

export default function MaintenancePage() {
  const [summary, setSummary] = useState<Summary>({ overdue: 0, dueSoon: 0, completedThisMonth: 0 });
  const [scheduleItems, setScheduleItems] = useState<ScheduleRow[]>([]);
  const [recentRecords, setRecentRecords] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogItemId, setDialogItemId] = useState<string | undefined>();
  const [dialogItemLabel, setDialogItemLabel] = useState<string | undefined>();
  const [dialogCycle, setDialogCycle] = useState<number | undefined>();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sum, sched, hist] = await Promise.all([
        getMaintenanceSummary(),
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
    } catch {
      toast.error("Failed to load maintenance data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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
          subtitle={summary.overdue > 0 ? "ต้องดำเนินการ" : undefined}
          iconName="Wrench"
          color="text-danger-500"
          className=""
        />
        <DashboardMetricCard
          title="ใกล้ถึงรอบ"
          value={summary.dueSoon}
          subtitle={summary.dueSoon > 0 ? "ภายใน 30 วัน" : undefined}
          iconName="AlertTriangle"
          color="text-orange-500"
          className=""
        />
        <DashboardMetricCard
          title="เสร็จเดือนนี้"
          value={summary.completedThisMonth}
          subtitle="รายการ"
          iconName="CheckCircle2"
          color="text-success"
          className=""
        />
      </div>

      {/* ── Overdue + Due-soon table ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">รายการที่ต้องบำรุง</h2>
          {scheduleItems.length > 0 && (
            <span className="text-sm text-muted-foreground">{scheduleItems.length} รายการ</span>
          )}
        </div>

        {loading ? (
          <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : scheduleItems.length === 0 ? (
          <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
            ไม่มีรายการที่เลยรอบหรือใกล้ถึงรอบ
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden !bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Code</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Item</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Due</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {scheduleItems.map((row) => {
                    const days = daysUntil(row.nextMaintenanceDate);
                    const isOverdue = row.maintenanceStatus === "overdue";
                    return (
                      <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs">{row.code}</td>
                        <td className="px-4 py-3">
                          <Link href={`/items/${row.id}`} className="hover:underline font-medium">
                            {row.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={isOverdue ? "destructive" : "secondary"}>
                            {isOverdue ? "Overdue" : "Due Soon"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {isOverdue ? (
                            <span className="text-destructive font-medium">เกิน {Math.abs(days)} วัน</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400">อีก {days} วัน</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => openRecordDialog(row.id, `${row.code} – ${row.name}`, row.maintenanceCycleMonths)}
                          >
                            <Wrench className="h-3.5 w-3.5" />
                            Record
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Recent records ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">บันทึกล่าสุด</h2>
          <Link
            href="/reports"
            className="text-sm text-primary hover:underline"
          >
            ดูทั้งหมดใน Reports →
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg border bg-muted/20 animate-pulse" />
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
                  "p-3 rounded-lg border !bg-white",
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
                  by {rec.performer}{rec.cost > 0 ? ` · ฿${rec.cost.toLocaleString()}` : ""}
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
        <span className="text-sm font-semibold">Record Maintenance</span>
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
