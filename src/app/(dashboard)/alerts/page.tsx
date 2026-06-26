"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { locationLabel } from "@/lib/constants";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAlerts } from "@/hooks/use-alerts";
import { useCategories, useLocations } from "@/hooks/use-lookup-data";
import { usePagination } from "@/hooks/use-pagination";
import { usePageHeader } from "@/components/layout/page-header-context";
import { getItems } from "@/lib/api";
import type { CategoryOption, LocationOption, ProfileOption } from "@/lib/api";
import { ItemsFilterBar, type FilterState } from "@/components/items/items-filter-bar";
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
  lots: { expiryDate: string | null }[];
  _count: { subItems: number };
  alertTypes: string[];
}

type AlertTypeKey = "all" | "lowStock" | "nearExpiry" | "overdueMaint";

const ALERT_BADGE: Record<string, string> = {
  lowStock: "bg-orange-500/15 text-orange-700 border-orange-500/30",
  nearExpiry: "bg-warning/15 text-warning-foreground border-warning/30",
  overdueMaint: "bg-destructive/15 text-destructive border-destructive/30",
};

const ALERT_LABEL: Record<string, string> = {
  lowStock: "สต็อกต่ำ",
  nearExpiry: "ใกล้หมดอายุ",
  overdueMaint: "เกินกำหนดซ่อม",
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
      return d ? `หมดอายุ ${new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}` : ALERT_LABEL.nearExpiry;
    }
    case "overdueMaint": {
      const days = item.nextMaintenanceDate ? Math.max(0, Math.floor((Date.now() - new Date(item.nextMaintenanceDate).getTime()) / DAY_MS)) : 0;
      return `เกินกำหนด ${days} วัน`;
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
  const [items, setItems] = useState<ItemRecord[]>([]);
  const { categories } = useCategories();
  const { locations } = useLocations();
  const { page, setPage, perPage, total, setTotal, totalPages } = usePagination(20);
  const [loading, setLoading] = useState(true);

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
    return "all";
  }, [searchParams]);

  const selectAlertType = useCallback((key: AlertTypeKey) => {
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    for (const k of ["lowStock", "nearExpiry", "overdueMaint"]) params.delete(k);
    if (key !== "all") params.set(key, "true");
    const qs = params.toString();
    router.replace(qs ? `/alerts?${qs}` : "/alerts");
  }, [searchParams, router, setPage]);

  const [filter, setFilter] = useState<FilterState>(() => {
    const statusParam = searchParams.get("status");
    return {
      query: "",
      profileId: "",
      categoryId: searchParams.get("category"),
      status: statusParam ? statusParam.split(",").filter(Boolean) : [],
      location: {},
      preset: null,
    };
  });
  const handleFilterChange = useCallback((next: FilterState) => { setFilter(next); setPage(1); }, [setPage]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), perPage: String(perPage) };
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
    setItems((data.items || []) as ItemRecord[]);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, perPage, filter, alertType, setTotal]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const alertChips: { key: AlertTypeKey; label: string; count: number }[] = [
    { key: "all", label: "ทั้งหมด", count: alerts.total },
    { key: "lowStock", label: "สต็อกต่ำ", count: alerts.lowStock },
    { key: "nearExpiry", label: "ใกล้หมดอายุ", count: alerts.nearExpiry },
    { key: "overdueMaint", label: "เกินกำหนดซ่อม", count: alerts.overdueMaintenance },
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

  return (
    <div className="space-y-6">
      {/* Alert-type tabs — underline style, matches /settings. Sits ABOVE the filter
          bar so it reads as primary nav, distinct from the refinement pills below.
          Per-type color lives in the table badges; the tab strip stays uniform. */}
      <div className="border-b">
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
        <div className="overflow-auto max-h-[58dvh] lg:max-h-[calc(100vh-340px)]">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-card border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <TableHead>รหัสพัสดุ</TableHead>
                <TableHead>ชื่อ</TableHead>
                <TableHead>การแจ้งเตือน</TableHead>
                <TableHead>รายละเอียด</TableHead>
                <TableHead>สถานที่</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
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
                  className={`cursor-pointer hover:bg-muted/50 transition-colors ${idx % 2 === 1 ? "bg-muted/40" : ""}`}
                  onClick={() => router.push(`/items/${item.id}`)}
                >
                  <TableCell className="font-mono text-sm">{item.code}</TableCell>
                  <TableCell>
                    <span className="font-medium">{item.name}</span>
                    {item.nameEn && <span className="text-muted-foreground ml-1">({item.nameEn})</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {item.alertTypes.map((t) => (
                        <span key={t} className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", ALERT_BADGE[t] ?? "bg-muted text-muted-foreground border-border")}>
                          {ALERT_LABEL[t] ?? t}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex flex-col gap-0.5">
                      {item.alertTypes.map((t) => (
                        <span key={t} className="text-xs text-muted-foreground tabular-nums">{alertDetail(item, t)}</span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{item.location ? locationLabel(item.location) : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Fixed footer */}
        <div className="flex items-center border-t bg-card px-4 py-2">
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(1)} className="h-7 w-7 p-0 text-xs">
              &laquo;
            </Button>
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-7 w-7 p-0">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            {Array.from({ length: totalPages || 1 }, (_, i) => i + 1)
              .filter((p) => {
                if (totalPages <= 7) return true;
                if (p === 1 || p === totalPages) return true;
                if (Math.abs(p - page) <= 2) return true;
                return false;
              })
              .reduce<(number | "...")[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "..." ? (
                  <span key={`dots-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                ) : (
                  <Button
                    key={p}
                    variant={page === p ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setPage(p)}
                    className="h-7 w-7 p-0 text-xs"
                  >
                    {p}
                  </Button>
                )
              )}
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="h-7 w-7 p-0">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="h-7 w-7 p-0 text-xs">
              &raquo;
            </Button>
          </div>
          <div className="flex-1" />
          <span className="text-sm text-muted-foreground tabular-nums">{total} items</span>
        </div>
      </div>
    </div>
  );
}
