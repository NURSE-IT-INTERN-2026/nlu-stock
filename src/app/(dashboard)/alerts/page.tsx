"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { fmtDate, TH_DATE, TH_DATETIME, TH_DAY } from "@/lib/format";
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
import { SubItemStatusPanel } from "@/components/receive/sub-item-status-panel";
import { ReturnPanel } from "@/components/receive/return-panel";
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

type AlertTypeKey = "all" | "lowStock" | "nearExpiry" | "overdueMaint" | "overdueReturn" | "damagedPending" | "dueCount";

const ALERT_BADGE: Record<string, string> = {
  lowStock: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  nearExpiry: "bg-warning/15 text-warning-foreground border-warning/30",
  overdueMaint: "bg-destructive/15 text-destructive border-destructive/30",
  dueCount: "bg-sky-500/15 text-sky-700 border-sky-500/30",
};

const ALERT_LABEL: Record<string, string> = {
  lowStock: "ต่ำกว่ากำหนด",
  nearExpiry: "ใกล้หมดอายุ",
  overdueMaint: "เกินกำหนดซ่อม",
  overdueReturn: "คืนเกินกำหนด",
  damagedPending: "ชำรุดรอดำเนินการ",
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
    if (searchParams.get("overdueMaint") === "true") return "overdueMaint";
    if (searchParams.get("overdueReturn") === "true") return "overdueReturn";
    if (searchParams.get("damagedPending") === "true") return "damagedPending";
    if (searchParams.get("dueCount") === "true") return "dueCount";
    return "all";
  }, [searchParams]);

  const selectAlertType = useCallback((key: AlertTypeKey) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const k of ["lowStock", "nearExpiry", "overdueMaint", "overdueReturn", "damagedPending", "dueCount"]) params.delete(k);
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
    // "แจ้งชำรุด" and "เกินกำหนดคืน" render their own worklist panels below instead of
    // the item table — skip the item fetch entirely while either is active.
    if (alertType === "damagedPending" || alertType === "overdueReturn") {
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
    { key: "lowStock", label: "ต่ำกว่ากำหนด", count: alerts.lowStock },
    { key: "nearExpiry", label: "ใกล้หมดอายุ", count: alerts.nearExpiry },
    { key: "overdueMaint", label: "เกินกำหนดซ่อม", count: alerts.overdueMaintenance },
    { key: "overdueReturn", label: "เกินกำหนดคืน", count: alerts.overdueReturn },
    { key: "damagedPending", label: "ชำรุด (รอส่งซ่อม)", count: alerts.damagedPending },
    { key: "dueCount", label: "ถึงรอบตรวจนับ", count: alerts.dueCount },
  ];

  // Reflect the active tab in the header breadcrumb ("การแจ้งเตือน › <tab>").
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
  if (alerts.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <CheckCircle2 className="size-12 text-success/60 mb-3" />
        <p className="text-lg font-medium">ไม่มีรายการแจ้งเตือน</p>
        <p className="text-sm text-muted-foreground mt-1">ทุกพัสดุอยู่ในเกณฑ์ปกติ</p>
      </div>
    );
  }

  // Panel branches (damagedPending / overdueReturn) own their internal scroll — give them a
  // flex root that fills main so only the panel scrolls, not the page (no double scrollbar).
  const isPanel = alertType === "damagedPending" || alertType === "overdueReturn";

  return (
    <div className={isPanel ? "flex flex-col h-full min-h-0 gap-3 sm:gap-6" : "space-y-3 sm:space-y-6"}>
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

      {alertType === "damagedPending" ? (
        <div className="flex-1 min-h-0">
          <SubItemStatusPanel status="DAMAGED" actionLabel="ส่งซ่อม" emptyText="ไม่มีพัสดุที่แจ้งชำรุดอยู่" />
        </div>
      ) : alertType === "overdueReturn" ? (
        <div className="flex-1 min-h-0">
          <ReturnPanel initialChip="overdue" readOnly />
        </div>
      ) : (
      <>
      <ItemsFilterBar
        profiles={profiles}
        categories={categories}
        locations={locations}
        alerts={alerts}
        value={filter}
        onChange={handleFilterChange}
        resultCount={total}
        onScanQR={() => {}}
        hideAlertPicker
        hideScan
      />

      <div className="rounded-2xl border overflow-hidden bg-card">
        {/* Desktop: table */}
        <div className="hidden md:block overflow-auto max-h-[58dvh] lg:max-h-[calc(100vh-340px)]">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-card border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)] [&>th]:h-8 [&>th]:py-0 [&>th]:text-xs [&>th]:text-muted-foreground">
                <TableHead className="w-28 px-2">รหัสพัสดุ</TableHead>
                <TableHead className="px-2">ชื่อ</TableHead>
                <TableHead className="w-48 px-2">การแจ้งเตือน</TableHead>
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
                    ไม่มีรายการแจ้งเตือน
                  </TableCell>
                </TableRow>
              ) : items.map((item, idx) => (
                <TableRow
                  key={item.id}
                  className={`h-9 cursor-pointer hover:bg-muted/50 transition-colors [&>td]:py-1 ${idx % 2 === 1 ? "bg-muted/40" : ""}`}
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
                      {item.alertTypes.map((t) => (
                        <span key={t} className={cn("inline-flex items-center rounded-full border px-1.5 py-0 text-[11px] font-medium leading-5 whitespace-nowrap", ALERT_BADGE[t] ?? "bg-muted text-muted-foreground border-border")}>
                          {ALERT_LABEL[t] ?? t}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs px-2">
                    <div className="flex flex-col gap-0.5">
                      {item.alertTypes.map((t) => (
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
            <div className="rounded-2xl border border-border/60 bg-card px-4 py-10 text-center text-sm text-muted-foreground">ไม่มีรายการแจ้งเตือน</div>
          ) : items.map((item) => {
            const primary = item.alertTypes.find((t) => ALERT_ICON[t]) ?? "lowStock";
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
                    {item.alertTypes.map((t) => (
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
                    {item.alertTypes.map((t) => (
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
      </>
      )}
    </div>
  );
}
