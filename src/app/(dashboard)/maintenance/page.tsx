"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { fmtDate, TH_DATE } from "@/lib/format";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ItemThumb } from "@/components/shared/item-thumb";
import { ArrowDownUp, ClipboardList, History, Loader2, PackageCheck, Pencil, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pagination } from "@/components/shared/pagination";
import { useClientPage } from "@/hooks/use-client-page";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { DashboardMetricCard } from "@/components/dashboard/dashboard-metric-card";
import { MaintenanceFormDialog } from "@/components/items/maintenance-form-dialog";
import { ReportFilters, type FilterValues } from "@/components/reports/report-filters";
import { ExportButtons } from "@/components/reports/export-buttons";
import { getMaintenanceSummary, getReport, updateItemStatus } from "@/lib/api";
import { toast } from "sonner";

import { usePageHeader } from "@/components/layout/page-header-context";
import { CaseWorkspace } from "@/components/cases/case-workspace";
// ── Types ──

interface Summary {
  overdue: number;
  dueSoon: number;
  // ส่งออกไปบำรุงข้างนอกแล้วยังไม่ได้กลับมา — นับแยก และไม่ถูกนับซ้ำในสองใบแรก
  // (api/maintenance/summary อธิบายไว้ว่าทำไม).
  inMaintenance: number;
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
  imageUrl: string | null;
  categoryName: string;
  /** ItemStatus of the piece (tracked) or the item (flat) — only AVAILABLE may be sent out. */
  status: string;
  location: string;
  lastMaintenanceDate: string;
  nextMaintenanceDate: string;
  maintenanceCycleMonths: number;
  // overdue | due-soon | in-maintenance | normal — เซิร์ฟเวอร์ตัดสินให้แล้ว รวมถึงกรณีของ
  // อยู่ข้างนอก ซึ่งชนะวันที่เสมอ (api/reports/maintenance-schedule)
  maintenanceStatus: string;
  subItemStatus: string | null;
  // เติมเฉพาะแถวที่ยังอยู่ข้างนอก (maintenanceStatus === "in-maintenance")
  sentAt: string | null;
  sentNote: string | null;
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
  overdue: { label: "เกินกำหนดซ่อมบำรุง", variant: "destructive", tone: "text-destructive dark:text-danger-400", pill: "bg-destructive/10 text-destructive dark:text-danger-400" },
  "due-soon": { label: "ใกล้ถึงกำหนดซ่อมบำรุง", variant: "secondary", tone: "text-amber-600 dark:text-amber-400", pill: "bg-warning/10 text-warning-700 dark:text-warning-200" },
  "in-maintenance": { label: "กำลังบำรุงรักษา", variant: "secondary", tone: "text-sky-600 dark:text-sky-400", pill: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  normal: { label: "ปกติ", variant: "outline", tone: "text-muted-foreground", pill: "bg-muted text-muted-foreground" },
} as const satisfies Record<string, { label: string; variant: "destructive" | "secondary" | "outline"; tone: string; pill: string }>;

function statusMeta(status: string) {
  return STATUS_META[status as keyof typeof STATUS_META] ?? STATUS_META.normal;
}

/** Soft-filled pill, the shape /repairs uses — a bordered Badge reads as a control, not a state. */
function StatusPill({ status }: { status: string }) {
  const meta = statusMeta(status);
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", meta.pill)}>
      {meta.label}
    </span>
  );
}

/** The one or two things a row can have done to it, as icon buttons in the จัดการ column and as
 *  full-width buttons on the mobile card — the same pair the ค้างซ่อม worklist draws. */
function RowActions({
  row, onOpen, iconOnly,
}: {
  row: ScheduleRow;
  onOpen: (row: ScheduleRow, mode?: "record" | "edit") => void;
  iconOnly?: boolean;
}) {
  // แก้ข้อมูล = เที่ยวเดิม (พิมพ์ชื่อร้านผิด, เพิ่มรายการที่ให้ทำ) — วันที่ส่งไม่ขยับ. คู่ขนานกับ
  // แก้ข้อมูลส่งซ่อม ของ flow ซ่อม.
  const actions = row.maintenanceStatus === "in-maintenance"
    ? ([
        { mode: "edit", label: "แก้ข้อมูลส่งบำรุงรักษา", Icon: Pencil },
        { mode: "record", label: "บันทึกรับคืน", Icon: PackageCheck },
      ] as const)
    : ([{ mode: "record", label: "บันทึกบำรุงรักษา", Icon: ClipboardList }] as const);

  return (
    <>
      {actions.map(({ mode, label, Icon }, i) => (
        <Button
          key={mode}
          size={iconOnly ? "icon" : "sm"}
          variant={i === 0 && actions.length > 1 ? "outline" : "default"}
          className={iconOnly ? "size-8" : "h-9 flex-1"}
          title={label}
          aria-label={`${label} ${row.code} ${row.name}`}
          onClick={() => onOpen(row, mode)}
        >
          <Icon className="size-3.5" />
          {!iconOnly && label}
        </Button>
      ))}
    </>
  );
}

/** Only a piece sitting on the shelf can leave for a maintenance round — ON_LOAN has to come
 *  back first, and one already out is out. Same rule the state machine enforces server-side. */
const sendable = (row: { status: string; maintenanceStatus: string }) =>
  row.status === "AVAILABLE" && row.maintenanceStatus !== "in-maintenance";

// ── Page ──

// ภาพรวม (กำหนดการตามรอบ) · ประวัติ (รอบที่ทำไปแล้ว). Both halves of ONE question: อะไรถึงรอบ
// บำรุงรักษาเมื่อไหร่. ของพัง/ค้างซ่อมเป็นคนละคำถาม และอยู่ที่ /repairs — เอามาปนกันแล้วผู้ใช้ที่มา
// ด้วย intent เดียวต้องอ่านผ่านอีก intent หนึ่งทุกครั้ง.
// แท็บรับคืนแยกจากภาพรวมเพราะเป็นคนละกริยา: ภาพรวมคือ "อ่านว่าอะไรถึงรอบ" (planning),
// รับคืนคือ "ลงมือปิดงานที่ค้างอยู่" (worklist) — และของที่อยู่ข้างนอกไม่มีวันโผล่ในหัวคนที่
// เปิดตารางกำหนดการมาดู. คู่ขนานกับ /repairs ที่แยกคิวค้างซ่อมออกจากประวัติ.
type MaintTab = "overview" | "receive" | "history";

const MAINT_TABS = [
  { value: "overview", label: "ภาพรวม", icon: ClipboardList },
  { value: "receive", label: "รับคืนจากบำรุงรักษา", icon: PackageCheck },
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

  const [summary, setSummary] = useState<Summary>({ overdue: 0, dueSoon: 0, inMaintenance: 0, completedThisMonth: 0 });
  const [scheduleItems, setScheduleItems] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [schedulePage, setSchedulePage] = useState(1);
  const [filter, setFilter] = useState<"all" | "overdue" | "due-soon" | "in-maintenance">("all");
  const [filters, setFilters] = useState<FilterValues>({});
  // Soonest-due first is what the API already returns and what the queue is read in; the toggle
  // is for the other question — "อะไรยังอีกนาน" when planning a batch to send out together.
  const [latestFirst, setLatestFirst] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkNote, setBulkNote] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogItemId, setDialogItemId] = useState<string | undefined>();
  const [dialogItemLabel, setDialogItemLabel] = useState<string | undefined>();
  const [dialogCycle, setDialogCycle] = useState<number | undefined>();
  const [dialogSubItemId, setDialogSubItemId] = useState<string | undefined>();
  const [dialogSubLabel, setDialogSubLabel] = useState<string | undefined>();
  // แถวที่ของอยู่ข้างนอก → ฟอร์มเดียวกันแต่เป็นใบรับคืน ไม่ใช่ใบส่ง
  const [dialogReceiving, setDialogReceiving] = useState(false);
  const [dialogSentInfo, setDialogSentInfo] = useState<{ note: string | null; sentAt: string | null } | undefined>();
  const [dialogEditSend, setDialogEditSend] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    // ponytail: perPage 200 — covers the whole schedule; bump if a tenant exceeds it.
    const params: Record<string, string> = { perPage: "200" };
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.location?.building) params.building = filters.location.building;
    if (filters.location?.floor) params.floor = filters.location.floor;
    if (filters.location?.room) params.room = filters.location.room;
    if (filters.location?.detail) params.detail = filters.location.detail;
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

  // ของที่ส่งออกไปแล้วยังไม่ได้คืน — worklist ของแท็บรับคืน. มาจาก scheduleItems ชุดเดียวกับ
  // ตารางภาพรวม ไม่ยิง API เพิ่ม: แถวยังอยู่ในกำหนดการอยู่แล้ว (nextMaintenanceDate ไม่ถูกแตะ
  // จนกว่าจะบันทึกผล) และ /maintenance คือประตูเดียวที่ส่งของออกไปได้.
  const outRows = scheduleItems.filter((i) => i.maintenanceStatus === "in-maintenance");
  const {
    page: outPage, setPage: setOutPage, paged: pagedOutRows,
  } = useClientPage(outRows, PAGE_SIZE.COMPACT);

  const filteredSchedule = (filter === "all"
    ? scheduleItems
    : scheduleItems.filter((i) => i.maintenanceStatus === filter)
  ).slice().sort((a, b) => {
    const d = new Date(a.nextMaintenanceDate).getTime() - new Date(b.nextMaintenanceDate).getTime();
    return latestFirst ? -d : d;
  });
  const pagedSchedule = filteredSchedule.slice((schedulePage - 1) * PAGE_SIZE.COMPACT, schedulePage * PAGE_SIZE.COMPACT);

  const bulkable = pagedSchedule.filter(sendable);
  const picked = filteredSchedule.filter((r) => selected.has(r.id) && sendable(r));
  const allPickedOnPage = bulkable.length > 0 && bulkable.every((r) => selected.has(r.id));

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of bulkable) {
        if (allPickedOnPage) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });

  // ส่งบำรุงรักษาภายนอกทีละหลายชิ้น — the venue and the work order are one answer for the whole
  // batch (they go to the same vendor in the same van), which is the only reason this bulks at
  // all. บันทึกผล never will: the result and the cost are per piece.
  const bulkSend = async () => {
    setBulkSaving(true);
    const results = await Promise.allSettled(
      picked.map((r) =>
        updateItemStatus(r.itemId, {
          newStatus: "PENDING_MAINTENANCE",
          subItemId: r.subItemId ?? undefined,
          notes: `ส่งบำรุงรักษาภายนอก — ${bulkNote.trim()}`,
          repairVenue: "EXTERNAL",
          repairNote: bulkNote.trim(),
        }),
      ),
    );
    setBulkSaving(false);
    const failed = results.filter((r) => r.status === "rejected").length;
    // Partial success is the normal outcome of a batch write, so it is counted rather than
    // swallowed — "ส่งแล้ว" after three of ten went through is how rows go missing.
    if (failed === picked.length) {
      const first = results[0];
      toast.error(first?.status === "rejected" && first.reason instanceof Error ? first.reason.message : "ส่งบำรุงรักษาไม่สำเร็จ");
    } else if (failed > 0) {
      toast.warning(`ส่งบำรุงรักษาแล้ว ${picked.length - failed} รายการ · ไม่สำเร็จ ${failed} รายการ`);
    } else {
      toast.success(`ส่งบำรุงรักษาภายนอกแล้ว ${picked.length} รายการ`);
    }
    setBulkOpen(false);
    setBulkNote("");
    setSelected(new Set());
    fetchData();
  };

  const toggleFilter = (target: "overdue" | "due-soon" | "in-maintenance") => {
    setFilter((f) => (f === target ? "all" : target));
    setSchedulePage(1);
  };

  const clearFilter = () => {
    setFilter("all");
    setSchedulePage(1);
  };

  const openRecordDialog = (row: ScheduleRow, mode: "record" | "edit" = "record") => {
    setDialogEditSend(mode === "edit");
    setDialogSentInfo(
      row.maintenanceStatus === "in-maintenance"
        ? { note: row.sentNote, sentAt: row.sentAt ? fmtThaiDate(row.sentAt) : null }
        : undefined,
    );
    setDialogItemId(row.itemId);
    setDialogItemLabel(`${row.code} – ${row.name}`);
    setDialogCycle(row.maintenanceCycleMonths);
    // Tracked copy → record against that specific piece; the dialog shows the "ชิ้น:" row.
    setDialogSubItemId(row.subItemId ?? undefined);
    setDialogSubLabel(row.subItemId ? row.code : undefined);
    setDialogReceiving(mode === "record" && row.maintenanceStatus === "in-maintenance");
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
                {value === "receive" && outRows.length > 0 && (
                  <span className={cn(
                    "inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-bold tabular-nums",
                    isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  )}>{outRows.length}</span>
                )}
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
        {/* flex-wrap + grow, ไม่ใช่ grid ตายตัว — การ์ดกินเต็มแถวเสมอไม่ว่าจะกี่ใบ */}
        <div className="flex flex-wrap gap-2 sm:gap-4 [&>*]:min-w-[9rem] [&>*]:flex-1 [&>*]:grow">
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
            title="กำลังบำรุงรักษา"
            value={summary.inMaintenance}
            subtitle={filter === "in-maintenance" ? "กดเพื่อยกเลิก" : summary.inMaintenance > 0 ? "ส่งออกไปแล้วยังไม่ได้คืน" : undefined}
            iconName="Truck"
            color="text-sky-500"
            onClick={summary.inMaintenance > 0 ? () => toggleFilter("in-maintenance") : undefined}
            active={filter === "in-maintenance"}
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
          <div className="px-4 pt-3">
            <h2 className="mb-3 text-lg font-semibold">ตารางบำรุงรักษา</h2>

            <ReportFilters
              config={{ dateRange: true, locations: true }}
              values={filters}
              onChange={setFilters}
              actions={
                <>
                  {/* Disabled rather than hidden: the checkboxes are visible from the start, so a
                      button appearing the moment one is ticked reads as a different screen. */}
                  <Button size="sm" className="h-9" disabled={picked.length === 0} onClick={() => setBulkOpen(true)}>
                    <Send className="size-3.5" />
                    ส่งบำรุงรักษาที่เลือก{picked.length > 0 && ` (${picked.length})`}
                  </Button>
                  <ExportButtons reportType="maintenance-schedule" filters={filters} />
                </>
              }
              className="rounded-none border-0 bg-transparent p-0 sm:p-0"
            />

          {filter !== "all" && (
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {statusMeta(filter).label}
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

          {/* ตารางเป็นกล่องของตัวเองในการ์ดใหญ่ เว้นขอบ 16px รอบด้าน ไม่ชนขอบการ์ด */}
          <div className="m-4 overflow-hidden rounded-xl border">
            <div className="hidden md:block overflow-auto max-h-[50dvh] lg:max-h-[calc(100vh-420px)]">
              <Table grid zebra className="table-fixed">
                <TableHeader sticky>
                  <TableRow>
                    <TableHead className="w-10 px-2">
                      <Checkbox
                        checked={allPickedOnPage}
                        disabled={bulkable.length === 0}
                        onCheckedChange={toggleAll}
                        aria-label="เลือกทั้งหน้า"
                      />
                    </TableHead>
                    <TableHead className="w-14 px-2">รูป</TableHead>
                    <TableHead className="w-36 px-2">รหัสพัสดุ</TableHead>
                    {/* The only column without a width — table-fixed hands it what the others
                        leave over, so those have to stay honest or the name collapses. */}
                    <TableHead className="px-2">ชื่อ</TableHead>
                    <TableHead className="w-36 px-2">สถานะ</TableHead>
                    <TableHead className="w-24 px-2">จำนวนวัน</TableHead>
                    {/* One sort control, not two: จำนวนวัน is a rendering of this same date, so
                        sorting either would produce the identical order. */}
                    <TableHead className="w-36 px-2">
                      <button
                        type="button"
                        onClick={() => { setLatestFirst((v) => !v); setSchedulePage(1); }}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        กำหนดการซ่อมบำรุง
                        <ArrowDownUp className="size-3 shrink-0" />
                      </button>
                    </TableHead>
                    <TableHead className="w-28 px-2">สถานที่</TableHead>
                    <TableHead className="w-24 px-2">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredSchedule.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
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
                        <TableCell className="px-2">
                          <Checkbox
                            checked={selected.has(row.id)}
                            disabled={!sendable(row)}
                            onCheckedChange={() => toggleRow(row.id)}
                            aria-label={`เลือก ${row.name}`}
                          />
                        </TableCell>
                        <TableCell className="px-2">
                          <div className="size-9 overflow-hidden rounded-md bg-muted">
                            <ItemThumb src={row.imageUrl} alt={row.name} />
                          </div>
                        </TableCell>
                        {/* รหัส → ลิงก์ไปหน้าพัสดุ. ชื่อเป็นข้อความเฉย ๆ: การกระทำอยู่ในคอลัมน์
                            จัดการแล้ว และปุ่มสองตัวที่ชื่อเหมือนกันในแถวเดียวทำให้ screen reader
                            อ่านเจอสองอัน โดยที่ทั้งคู่ทำงานเดียวกัน */}
                        <TableCell className="font-mono text-xs px-2">
                          <Link href={`/items/${row.itemId}`} className="block truncate text-muted-foreground hover:text-foreground hover:underline">{row.code}</Link>
                        </TableCell>
                        <TableCell className="px-2 font-medium">
                          <p className="line-clamp-2 whitespace-normal break-words">{row.name}</p>
                        </TableCell>
                        <TableCell className="px-2"><StatusPill status={row.maintenanceStatus} /></TableCell>
                        <TableCell className={cn("text-xs px-2 tabular-nums", meta.tone)}>
                          {days < 0 ? `เกิน ${Math.abs(days)} วัน` : `อีก ${days} วัน`}
                        </TableCell>
                        <TableCell className="text-xs px-2 tabular-nums">
                          {fmtThaiDate(row.nextMaintenanceDate)}
                        </TableCell>
                        <TableCell className="px-2 text-xs text-muted-foreground">
                          <span className="block line-clamp-2 whitespace-normal break-words" title={row.location}>{row.location || "—"}</span>
                        </TableCell>
                        <TableCell className="px-2">
                          <div className="flex items-center gap-1">
                            <RowActions row={row} onOpen={openRecordDialog} iconOnly />
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
              ) : filteredSchedule.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">ไม่พบรายการตามตัวกรอง</div>
              ) : pagedSchedule.map((row) => {
                const days = daysUntil(row.nextMaintenanceDate);
                const meta = statusMeta(row.maintenanceStatus);
                return (
                  <div key={row.id} className="flex gap-3 px-4 py-2.5">
                    <Checkbox
                      className="mt-1 shrink-0"
                      checked={selected.has(row.id)}
                      disabled={!sendable(row)}
                      onCheckedChange={() => toggleRow(row.id)}
                      aria-label={`เลือก ${row.name}`}
                    />
                    <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                      <ItemThumb src={row.imageUrl} alt={row.name} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 font-medium leading-tight break-words">{row.name}</p>
                        <span className="shrink-0"><StatusPill status={row.maintenanceStatus} /></span>
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
                        <div className="text-xs text-muted-foreground break-words">{row.location}</div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <RowActions row={row} onOpen={openRecordDialog} />
                      </div>
                    </div>
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

      {/* ── รับคืนจากบำรุงรักษา ── */}
      {/* การ์ดต่อแถว ไม่ใช่ตาราง: คิวนี้ตอบคำถามเดียว "ของอยู่ข้างนอกมากี่วันแล้ว และจะรับคืนมั้ย"
          คอลัมน์ที่เหลือของตารางกำหนดการไม่ช่วยตอบ */}
      <div className={cn("pb-4", tab !== "receive" && "hidden")}>
        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-3">
            <h2 className="text-lg font-semibold">รอรับคืนจากบำรุงรักษา</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{outRows.length} รายการ</span>
          </div>
          <div className="divide-y divide-border border-t">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-4 py-3"><Skeleton className="h-10 w-full" /></div>
              ))
            ) : outRows.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                ไม่มีพัสดุที่ส่งบำรุงรักษาภายนอกค้างอยู่
              </div>
            ) : pagedOutRows.map((row) => {
              // ส่งไปแล้วกี่วัน — บวกเสมอ ต่างจากตารางกำหนดการที่นับถอยหลังหาวันครบรอบ
              const daysOut = row.sentAt ? Math.max(0, -daysUntil(row.sentAt)) : null;
              return (
                <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium leading-tight">{row.name}</span>
                      <Badge variant="secondary" className="px-1.5 py-0 leading-5 text-[11px]">
                        กำลังบำรุงรักษา
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <Link href={`/items/${row.itemId}`} className="font-mono hover:text-foreground hover:underline">{row.code}</Link>
                      {row.location && <span className="truncate">{row.location}</span>}
                      {row.sentAt && (
                        <span className="tabular-nums">
                          ส่งเมื่อ {fmtThaiDate(row.sentAt)}
                          {daysOut !== null && ` · ${daysOut} วัน`}
                        </span>
                      )}
                    </div>
                    {row.sentNote && (
                      <p className="text-xs text-muted-foreground/90 line-clamp-2">{row.sentNote}</p>
                    )}
                  </div>
                  {/* แก้ข้อมูล = เที่ยวเดิม (พิมพ์ชื่อร้านผิด, เพิ่มรายการที่ให้ทำ) — วันที่ส่งไม่ขยับ
                      คู่ขนานกับ แก้ข้อมูลส่งซ่อม ของ flow ซ่อม */}
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openRecordDialog(row, "edit")}>
                      แก้ข้อมูล
                    </Button>
                    <Button size="sm" onClick={() => openRecordDialog(row)}>
                      บันทึกรับคืน
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          {outRows.length > 0 && (
            <Pagination page={outPage} total={outRows.length} pageSize={PAGE_SIZE.COMPACT} onChange={setOutPage} />
          )}
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
        receiving={dialogReceiving}
        editSend={dialogEditSend}
        sentInfo={dialogSentInfo}
        itemId={dialogItemId}
        itemLabel={dialogItemLabel}
        subItemId={dialogSubItemId}
        subItemLabel={dialogSubLabel}
        maintenanceCycleMonths={dialogCycle}
        onSuccess={fetchData}
      />

      {/* ส่งบำรุงรักษาภายนอกทีละหลายชิ้น. The single-row path goes through MaintenanceFormDialog,
          which asks the same one question plus the fields only a result has — this asks that
          question alone, once, for the whole batch. */}
      <AlertDialog open={bulkOpen} onOpenChange={(v) => !v && setBulkOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ส่งบำรุงรักษาภายนอก</AlertDialogTitle>
            <AlertDialogDescription>
              ส่ง <span className="font-medium text-foreground">{picked.length} รายการ</span> ออกไปบำรุงรักษาภายนอก —
              ทุกชิ้นจะขึ้นสถานะ &ldquo;กำลังบำรุงรักษา&rdquo; เมื่อของกลับมา กรุณากด &ldquo;บันทึกรับคืน&rdquo; ที่แท็บรับคืนจากบำรุงรักษา
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Direct child of AlertDialogContent (not Header) so the separator's -mx-4 reaches
              both dialog edges (Header is a centered grid → clips). */}
          <div className="w-full space-y-3 text-left">
            <div className="-mx-4"><Separator /></div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground" required>หน่วยงานผู้รับงานและรายการที่ให้ดำเนินการ</Label>
              <Textarea
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                placeholder="เช่น ส่งบริษัท ABC ตรวจเช็คประจำปี เปลี่ยนอะไหล่ตามสภาพ…"
                rows={3}
                className="bg-card"
              />
            </div>
            {/* หลักฐานแนบเป็นของรายชิ้น ไม่มีกองกลางให้แปะ — แนบทีหลังที่ปุ่มแก้ข้อมูลของแต่ละแถว */}
            <p className="text-xs text-muted-foreground">
              แนบหลักฐานได้ทีหลังที่ปุ่ม &ldquo;แก้ข้อมูลส่งบำรุงรักษา&rdquo; ของแต่ละรายการ
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction disabled={bulkSaving || !bulkNote.trim()} onClick={bulkSend}>
              {bulkSaving && <Loader2 className="size-3.5 animate-spin" />}ยืนยันส่ง
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

