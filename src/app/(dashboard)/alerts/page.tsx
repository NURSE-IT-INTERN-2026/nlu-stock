"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { fmtDate, TH_DAY } from "@/lib/format";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ChevronRight, CheckCircle2, MapPin, Package, Clock, Wrench, ClipboardCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { locationLabel } from "@/lib/constants";
import { parseItemStatusList } from "@/lib/status-utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAlerts } from "@/hooks/use-alerts";
import { useCategories, useLocations } from "@/hooks/use-lookup-data";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePagedList } from "@/hooks/use-paged-list";
import { Pagination } from "@/components/shared/pagination";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { usePageHeader } from "@/components/layout/page-header-context";
import { getItems } from "@/lib/api";
import type { CategoryOption, LocationOption, ProfileOption } from "@/lib/api";
import { ItemsFilterBar, type FilterState } from "@/components/items/items-filter-bar";
import { CaseWorkspace } from "@/components/cases/case-workspace";
import { ReportSummary, type SummaryStat } from "@/components/reports/report-summary";
import { ExportButtons } from "@/components/reports/export-buttons";
import { useSession } from "@/components/layout/auth-guard";
import { canManageStock } from "@/lib/roles";
import type { CaseTotalsJson } from "@/lib/api";
import { cn } from "@/lib/utils";

interface UnitType { id: string; name: string }

interface ItemRecord {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  category: CategoryOption;
  trackIndividually: boolean;
  status: string;
  issueUnit: UnitType;
  availableQty: number;
  totalQty: number;
  minThreshold: number;
  location: LocationOption | null;
  nextMaintenanceDate: string | null;
  nextCountDate: string | null;
  lots: { expiryDate: string | null }[];
  _count: { subItems: number };
  alertTypes: string[];
}

// `todo` เป็นแท็บเดียวที่แถวไม่ใช่พัสดุ แต่เป็นใบเคส — พัสดุชิ้นเดียวที่ทั้งชำรุดและเลยกำหนดคืน
// เป็นสองงานที่ต้องทำคนละอย่าง ยุบเป็นแถวเดียวแล้วจะมีงานหนึ่งหายไปจากสายตา.
//
// ทุกแท็บที่เหลือ render ตารางพัสดุ. คิวงานที่ต้องลงมือทำไม่อยู่ที่นี่แล้ว — เกินกำหนดคืนอยู่
// /receive?tab=return&due=overdue, ชำรุดรอส่งซ่อมอยู่ /repairs, เกินกำหนดบำรุงอยู่ /maintenance.
// สามแท็บนั้นเคยอยู่ที่นี่เป็นสำเนาแบบกดทำอะไรไม่ได้ของหน้าพวกนั้น: fetch ก้อนเดียวกัน จ่ายค่า
// render เท่ากัน แล้วจบด้วยการเด้งคนไปอีกหน้าเพื่อกดปุ่ม. งานที่ค้างอยู่ยังเห็นได้ที่แท็บ
// `todo` ซึ่งนับใบเคสจากที่มาเดียวกัน.
type AlertTypeKey = "all" | "lowStock" | "nearExpiry" | "dueCount" | "todo";

const ALERT_BADGE: Record<string, string> = {
  lowStock: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  nearExpiry: "bg-warning/15 text-warning-foreground border-warning/30",
  overdueMaint: "bg-destructive/15 text-destructive border-destructive/30",
  dueCount: "bg-sky-500/15 text-sky-700 border-sky-500/30",
};

const ALERT_LABEL: Record<string, string> = {
  lowStock: "ต่ำกว่าขั้นต่ำ",
  nearExpiry: "ใกล้หมดอายุ",
  overdueMaint: "เกินกำหนดซ่อมบำรุง",
  dueCount: "ถึงรอบตรวจนับ",
};

// Mobile row icon by alert type (desktop table keeps text badges only).
const ALERT_ICON: Record<string, { icon: typeof Package; cls: string }> = {
  lowStock: { icon: Package, cls: "bg-orange-500/10 text-orange-700 ring-orange-500/20" },
  nearExpiry: { icon: Clock, cls: "bg-warning/10 text-warning-700 ring-warning/20" },
  overdueMaint: { icon: Wrench, cls: "bg-destructive/10 text-destructive ring-destructive/20" },
  dueCount: { icon: ClipboardCheck, cls: "bg-sky-500/10 text-sky-700 ring-sky-500/20" },
};

const DAY_MS = 24 * 60 * 60 * 1000;

function alertDetail(item: ItemRecord, type: string): string {
  switch (type) {
    case "lowStock": {
      const qty = item.availableQty === item.totalQty ? `${item.availableQty}` : `${item.availableQty}/${item.totalQty}`;
      return `${qty} ${item.issueUnit.name} · ขั้นต่ำ ${item.minThreshold}`;
    }
    case "nearExpiry": {
      const d = item.lots[0]?.expiryDate;
      if (!d) return ALERT_LABEL.nearExpiry;
      const date = fmtDate(d, TH_DAY);
      // Past expiry → say so outright; upcoming → show the date.
      return new Date(d).getTime() < Date.now() ? `หมดอายุแล้ว · ${date}` : `หมดอายุ ${date}`;
    }
    case "overdueMaint": {
      const days = item.nextMaintenanceDate ? Math.max(0, Math.floor((Date.now() - new Date(item.nextMaintenanceDate).getTime()) / DAY_MS)) : 0;
      return `เกินกำหนด ${days} วัน`;
    }
    case "dueCount": {
      if (!item.nextCountDate) return "ยังไม่เคยตรวจนับ";
      const days = Math.max(0, Math.floor((Date.now() - new Date(item.nextCountDate).getTime()) / DAY_MS));
      return `ถึงรอบมาแล้ว ${days} วัน`;
    }
    default:
      return "";
  }
}

export default function AlertsPage() {
  return (
    <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-96 w-full" /></div>}>
      <AlertsContent />
    </Suspense>
  );
}

function AlertsContent() {
  const alerts = useAlerts();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setDetail } = usePageHeader();
  const { user } = useSession();
  const isMobile = useIsMobile();
  const { categories } = useCategories();
  const { locations } = useLocations();
  const perPage = PAGE_SIZE.DEFAULT;

  const profiles = useMemo<ProfileOption[]>(() => {
    const map = new Map<string, ProfileOption>();
    for (const c of categories) if (c.profile) map.set(c.profile.id, c.profile);
    return [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories]);

  // Alert-type filter is URL-driven (?lowStock=true etc.) so bell links and chip clicks stay in sync
  // even when navigating between param variants of /alerts without a remount.
  const alertType: AlertTypeKey = useMemo(() => {
    if (searchParams.get("lowStock") === "true") return "lowStock";
    if (searchParams.get("nearExpiry") === "true") return "nearExpiry";
    if (searchParams.get("dueCount") === "true") return "dueCount";
    if (searchParams.get("todo") === "true") return "todo";
    return "all";
  }, [searchParams]);

  const selectAlertType = useCallback((key: AlertTypeKey) => {
    const params = new URLSearchParams(searchParams.toString());
    // แท็บที่ย้ายออกไปหน้าอื่นแล้วยังอยู่ในลิสต์นี้: bookmark เก่าที่ยังมี ?overdueReturn=true
    // ติดมาต้องถูกล้างทิ้งตอนกดแท็บอื่น ไม่งั้นมันค้างใน URL ตลอดไป.
    for (const k of ["lowStock", "nearExpiry", "overdueMaint", "overdueReturn", "damagedPending", "dueCount", "todo"]) params.delete(k);
    if (key !== "all") params.set(key, "true");
    const qs = params.toString();
    router.replace(qs ? `/alerts?${qs}` : "/alerts");
  }, [searchParams, router]);

  const [filter, setFilter] = useState<FilterState>(() => {
    const statusParam = searchParams.get("status");
    return {
      query: "",
      profileId: "",
      categoryId: searchParams.get("category"),
      status: parseItemStatusList(statusParam),
      location: {},
      preset: null,
    };
  });
  const handleFilterChange = useCallback((next: FilterState) => { setFilter(next); }, []);

  const fetchPage = useCallback(async (p: number) => {
    // `todo` renders case rows, not items — skip the item fetch entirely while it is active.
    if (alertType === "todo") {
      return { items: [], total: 0 };
    }
    const params: Record<string, string> = { page: String(p), perPage: String(perPage) };
    if (filter.query) params.search = filter.query;
    if (filter.profileId) params.profileId = filter.profileId;
    if (filter.categoryId) params.categoryId = filter.categoryId;
    if (filter.status.length) params.status = filter.status.join(",");
    if (alertType === "all") params.alerts = "true";
    else params[alertType] = "true";
    if (filter.location.building) params.building = filter.location.building;
    if (filter.location.floor) params.floor = filter.location.floor;
    if (filter.location.room) params.room = filter.location.room;
    if (filter.location.detail) params.detail = filter.location.detail;

    const data = await getItems(params);
    return { items: (data.items || []) as ItemRecord[], total: data.total || 0 };
  }, [filter, perPage, alertType]);

  const {
    items, total, page, loading, isLoadingMore, hasNext, loadMore, setPage,
  } = usePagedList<ItemRecord>({ fetchPage, pageSize: perPage, isMobile });

  const alertChips: { key: AlertTypeKey; label: string; count: number }[] = [
    { key: "all", label: "ทั้งหมด", count: alerts.total },
    // นำหน้าแท็บที่เหลือ: แท็บอื่นบอกว่า "พัสดุตัวไหนผิดปกติ" แท็บนี้บอกว่า "ใครต้องไปทำอะไร"
    // ซึ่งเป็นคำถามที่คนเปิดหน้านี้มาถามก่อน.
    { key: "todo", label: "รายการสิ่งที่ต้องทำ", count: alerts.openCases },
    { key: "lowStock", label: "ต่ำกว่าขั้นต่ำ", count: alerts.lowStock },
    { key: "nearExpiry", label: "ใกล้หมดอายุ", count: alerts.nearExpiry },
    { key: "dueCount", label: "ถึงรอบตรวจนับ", count: alerts.dueCount },
  ];

  // Reflect the active tab in the header breadcrumb ("รายการที่ต้องจัดการ › <tab>").
  const activeTabLabel = alertChips.find((c) => c.key === alertType)?.label ?? "ทั้งหมด";
  useEffect(() => {
    setDetail(activeTabLabel);
    return () => setDetail(null);
  }, [activeTabLabel, setDetail]);

  // Counts default to 0 before the first fetch resolves — wait for `loaded` to avoid
  // flashing the empty state on every navigation.
  if (!alerts.loaded) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // No alerts at all → clean empty state, no tab strip / filter bar.
  //
  // ponytail: `total` ไม่มี overdueReturn/damagedPending อยู่ในนั้นแล้ว (ดู lib/alerts) หน้านี้จึง
  // พูดว่า "ไม่มีรายการที่ต้องจัดการ" ได้ทั้งที่ยังมีของค้างคืน — ถ้า openCases ไม่ครอบสองก้อนนั้น.
  // ตอนนี้ครอบอยู่ (isTodo รับ BORROW เลยกำหนด, ชิ้น DAMAGED เปิดเป็นเคส REPAIR) แต่มันจริง
  // เพราะ implementation สามที่พ้องกัน ไม่ใช่เพราะโครงสร้างบังคับ. ถ้าวันไหนแก้จังหวะ stamp
  // returnedAt หรือเกณฑ์ isTodo แล้วสองเซ็ตนั้นหลุดออกจากกัน gate นี้จะพังเงียบ — ตอนนั้นค่อย
  // เปลี่ยนไปเช็ค `overdueReturn === 0 && damagedPending === 0` ตรงๆ พร้อมเทสที่ยันว่า
  // openCases ⊇ overdueReturn ∪ damagedPending.
  if (alerts.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <CheckCircle2 className="size-12 text-success/60 mb-3" />
        <p className="text-lg font-medium">ไม่มีรายการที่ต้องจัดการ</p>
        <p className="text-sm text-muted-foreground mt-1">ทุกพัสดุอยู่ในเกณฑ์ปกติ</p>
      </div>
    );
  }

  // Badge/detail column answers the active tab: a specific tab shows only its own type,
  // "ทั้งหมด" shows every reason the row is flagged.
  const typesFor = (item: ItemRecord) =>
    alertType === "all" ? item.alertTypes : item.alertTypes.filter((t) => t === alertType);

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Alert-type tabs — underline style, matches /settings. Sits ABOVE the filter
          bar so it reads as primary nav, distinct from the refinement pills below.
          Per-type color lives in the table badges; the tab strip stays uniform. */}
      <div className="hidden md:block shrink-0 border-b -mx-4 px-4 sm:-mx-6 sm:px-6">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {alertChips.map((c) => {
            const active = alertType === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => selectAlertType(c.key)}
                className={cn(
                  "relative flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
                )}
              >
                {c.label}
                {c.count > 0 && (
                  <span className={cn(
                    "inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-bold tabular-nums",
                    active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  )}>{c.count}</span>
                )}
                {active && (
                  <motion.span
                    layoutId="alerts-tab"
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                    className="absolute -bottom-[2px] left-0 right-0 h-0.5 bg-primary"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Mobile: chip filter — desktop keeps the underline tabs above */}
      <div className="md:hidden shrink-0 -mx-4 px-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max items-center gap-2 pb-1">
          {alertChips.map((c) => {
            const active = alertType === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => selectAlertType(c.key)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                  active
                    ? "bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-sm"
                    : "border border-border/60 bg-card text-foreground hover:bg-accent"
                )}
              >
                {c.label}
                {c.count > 0 && (
                  <span className={cn(
                    "inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold tabular-nums",
                    active ? "bg-white/25" : "bg-muted text-muted-foreground"
                  )}>{c.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {alertType === "todo" ? (
        <TodoTab canEdit={canManageStock(user?.role ?? "")} />
      ) : (
      <>
      <div className="rounded-2xl border overflow-hidden bg-card">
        <ItemsFilterBar
          className="rounded-none border-x-0 border-t-0"
          profiles={profiles}
          categories={categories}
          locations={locations}
          value={filter}
          onChange={handleFilterChange}
          resultCount={total}
          onScanQR={() => {}}
          hideScan
        />

        {/* Inner card on desktop only — mobile already renders standalone alert cards,
            so a third border there would just nest a card inside a card inside a card. */}
        <div className="md:p-4">
          <div className="md:rounded-xl md:border md:overflow-hidden md:flex md:flex-col">
        {/* Desktop: table */}
        <div className="hidden md:block overflow-auto max-h-[58dvh] lg:max-h-[calc(100vh-340px)]">
          <Table grid zebra className="table-fixed">
            <TableHeader sticky>
              <TableRow>
                <TableHead className="w-28 px-2">รหัสพัสดุ</TableHead>
                <TableHead className="px-2">ชื่อ</TableHead>
                <TableHead className="w-48 px-2">ประเภท</TableHead>
                <TableHead className="w-56 px-2">รายละเอียด</TableHead>
                <TableHead className="w-44 px-2 hidden xl:table-cell">สถานที่</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j} className={j === 4 ? "hidden xl:table-cell" : undefined}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    ไม่มีรายการที่ต้องจัดการ
                  </TableCell>
                </TableRow>
              ) : items.map((item) => (
                <TableRow
                  key={item.id}
                  // ประเภท wraps its badges and รายละเอียด stacks one line per alert, so row
                  // height is variable — align-top keeps รหัส/ชื่อ/สถานที่ on the first line
                  // of it instead of drifting down as a row gains alerts.
                  className="cursor-pointer hover:bg-muted/50 transition-colors [&>td]:align-top"
                  onClick={() => router.push(`/items/${item.id}`)}
                >
                  <TableCell className="font-mono text-xs px-2"><span className="block truncate">{item.code}</span></TableCell>
                  <TableCell className="px-2">
                    <div className="flex items-center min-w-0">
                      <span className="truncate min-w-0">
                        <span className="font-medium">{item.name}</span>
                        {item.nameEn && <span className="text-muted-foreground ml-1">({item.nameEn})</span>}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-2">
                    <div className="flex flex-wrap gap-1">
                      {typesFor(item).map((t) => (
                        <span key={t} className={cn("inline-flex items-center rounded-full border px-1.5 py-0 text-[11px] font-medium leading-5 whitespace-nowrap", ALERT_BADGE[t] ?? "bg-muted text-muted-foreground border-border")}>
                          {ALERT_LABEL[t] ?? t}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs px-2">
                    <div className="flex flex-col gap-0.5">
                      {typesFor(item).map((t) => (
                        <span key={t} className="text-muted-foreground tabular-nums">{alertDetail(item, t)}</span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm px-2 hidden xl:table-cell"><span className="block truncate">{item.location ? locationLabel(item.location) : "-"}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile: standalone alert cards */}
        <div className="md:hidden space-y-2 p-1">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card px-4 py-10 text-center text-sm text-muted-foreground">ไม่มีรายการที่ต้องจัดการ</div>
          ) : items.map((item) => {
            const primary = alertType === "all" ? (item.alertTypes.find((t) => ALERT_ICON[t]) ?? "lowStock") : alertType;
            const meta = ALERT_ICON[primary] ?? ALERT_ICON.lowStock;
            const Icon = meta.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(`/items/${item.id}`)}
                className="group flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-card p-3 text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
              >
                <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl ring-1", meta.cls)}>
                  <Icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {typesFor(item).map((t) => (
                      <span key={t} className={cn("inline-flex items-center rounded-full border px-1.5 py-0 text-[11px] font-medium leading-5", ALERT_BADGE[t] ?? "bg-muted text-muted-foreground border-border")}>
                        {ALERT_LABEL[t] ?? t}
                      </span>
                    ))}
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">{item.code}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold leading-snug">
                    {item.name}
                    {item.nameEn && <span className="font-normal text-muted-foreground"> ({item.nameEn})</span>}
                  </p>
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {typesFor(item).map((t) => (
                      <span key={t} className="text-xs text-muted-foreground tabular-nums">{alertDetail(item, t)}</span>
                    ))}
                  </div>
                  {item.location && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MapPin className="size-3 shrink-0" />
                      <span className="truncate">{locationLabel(item.location)}</span>
                    </p>
                  )}
                </div>
                <ChevronRight className="size-4 shrink-0 self-center text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            );
          })}
        </div>

        {/* Pagination — desktop numbered, mobile load-more */}
        {isMobile ? (
          items.length > 0 && (
            <Pagination
              mode="loadMore"
              shown={items.length}
              total={total}
              hasMore={hasNext}
              isLoading={isLoadingMore}
              onLoadMore={loadMore}
            />
          )
        ) : (
          <Pagination page={page} total={total} pageSize={perPage} onChange={setPage} />
        )}
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

/**
 * รายการสิ่งที่ต้องทำ — เวิร์กสเปซเคสตัวเดียวกับที่ /repairs, /maintenance และประวัติของพัสดุใช้
 * ต่างกันแค่ถูกล็อกไว้ที่งานที่ยังไม่จบ. กดแถวแล้วรายละเอียดเปิดเป็น drawer ทับตารางตรงนั้น ปิดแล้ว
 * กลับมาที่แถวเดิม — ไม่ต้องเด้งออกไปหน้าอื่นแล้วให้คนไล่หาแถวเดิมซ้ำอีกรอบ.
 */
function TodoTab({ canEdit }: { canEdit: boolean }) {
  const [totals, setTotals] = useState<CaseTotalsJson | null>(null);
  const [query, setQuery] = useState("");
  return (
    <div className="space-y-4">
      {totals && lostStat(totals).length > 0 && <ReportSummary stats={lostStat(totals)} />}
      <CaseWorkspace
        todo
        canEdit={canEdit}
        onTotals={(t, q) => { setTotals(t); setQuery(q); }}
        actions={<ExportButtons reportType="cases" filters={exportFilters(query)} />}
      />
    </div>
  );
}

/**
 * ตัวกรองที่หน้าจอใช้อยู่ แปลงเป็นสิ่งที่ /api/reports/export รับ: `type` ถูกจองไว้เป็นชนิดรายงานแล้ว
 * ประเภทเคสจึงต้องเดินทางในชื่อ caseType ไม่งั้นมันจะเขียนทับ type=cases แล้วไฟล์จะออกมาผิดรายงาน.
 * `perPage` เป็นเรื่องของการแบ่งหน้าบนจอ ไฟล์ส่งออกทั้งชุดเสมอ. `todo` เดินทางไปด้วย — ไฟล์ที่
 * ส่งออกมาทั้ง 697 เคสจากจอที่แสดง 420 คือไฟล์ที่ไม่มีใครเชื่ออีกเลย.
 */
function exportFilters(query: string): Record<string, string | undefined> {
  const p = new URLSearchParams(query);
  p.delete("perPage");
  p.delete("page");
  const type = p.get("type");
  p.delete("type");
  if (type) p.set("caseType", type);
  return Object.fromEntries(p);
}

/**
 * ของที่ยังหาไม่พบ — ยอดเดียวที่เหลือจากการ์ดเงินสองใบของแท็บเคสงานเดิม. ค่าซ่อมย้ายไปไหนไม่ได้
 * เพราะ ค่าใช้จ่ายรายปี มีของมันอยู่แล้ว; ส่วนก้อนนี้ไม่ใช่รายงานเงิน มันคือ "ยังตามของไม่ได้อีก
 * เท่าไหร่" ซึ่งเป็นงานที่ค้าง จึงมาอยู่หัวรายการงานที่ค้าง.
 *
 * นำด้วยจำนวนชิ้นจนกว่าจะตีราคาได้เกินครึ่ง — ของหาย 101 ชิ้นที่รู้ราคาแค่ชิ้นเดียวแล้วขึ้นหัวว่า
 * ฿60,000 อ่านเหมือนยอดความเสียหายจริง ทั้งที่อีก 100 ชิ้นยังไม่ถูกนับ.
 */
function lostStat(t: CaseTotalsJson): SummaryStat[] {
  if (t.lostCases === 0) return [];
  const baht = (n: number) => n.toLocaleString("th-TH");
  const known = t.lostPriced / t.lostCases >= 0.5;
  // ป้าย (ประมาณการ) หายเองเมื่อทุกเคสที่ตีราคาได้ใช้ราคาจากใบรับเข้าของชิ้นนั้นเอง
  const estimated = t.lostExact < t.lostPriced;
  return [known
    ? {
        label: estimated ? "มูลค่าของที่ยังหาไม่พบ (ประมาณการ)" : "มูลค่าของที่ยังหาไม่พบ",
        value: baht(t.lostValue),
        hint: `${t.lostUnits.toLocaleString()} หน่วย · ตีราคาได้ ${t.lostPriced.toLocaleString()} จาก ${t.lostCases.toLocaleString()} เคส`,
        token: "lost",
      }
    : {
        label: "ของที่ยังหาไม่พบ",
        value: `${t.lostUnits.toLocaleString()} หน่วย`,
        // "บาท" ตรงนี้ไม่ใช่ของประดับ: การ์ดใบนี้พาดหัวเป็นจำนวนหน่วย ป้ายจึงไม่ได้บอกว่าเป็นเงิน
        // และ hint บรรทัดนี้มีเลขสามตัวปนกัน (เคสที่ตีราคาได้ / เคสทั้งหมด / มูลค่า) — ใบที่พาดหัว
        // เป็นเงินอยู่แล้วไม่ต้องมี เพราะป้ายของมันขึ้นต้นว่า "มูลค่า"
        hint: t.lostPriced === 0
          ? `${t.lostCases.toLocaleString()} เคส · ยังไม่มีเคสไหนตีราคาได้`
          : `ตีราคาได้ ${t.lostPriced.toLocaleString()} จาก ${t.lostCases.toLocaleString()} เคส · ประมาณ ${baht(t.lostValue)} บาท`,
        token: "lost",
      }];
}
