"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_PILLS, STATUS_LABELS, locationLabel } from "@/lib/constants";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAlerts } from "@/hooks/use-alerts";
import { useCategories, useLocations } from "@/hooks/use-lookup-data";
import { usePagination } from "@/hooks/use-pagination";
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
  _count: { subItems: number };
  alertTypes: string[];
}

type AlertTypeKey = "all" | "lowStock" | "nearExpiry" | "overdueMaint" | "onLoan";

const ALERT_BADGE: Record<string, string> = {
  lowStock: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  nearExpiry: "bg-warning/15 text-warning border-warning/30",
  overdueMaint: "bg-destructive/15 text-destructive border-destructive/30",
  onLoan: "bg-blue-500/15 text-blue-600 border-blue-500/30",
};

const ALERT_LABEL: Record<string, string> = {
  lowStock: "สต็อกต่ำ",
  nearExpiry: "ใกล้หมดอายุ",
  overdueMaint: "เกินกำหนดซ่อม",
  onLoan: "ยืมอยู่",
};

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

  // Initial alert-type filter from URL params (?lowStock=true etc.), default "all" = union.
  const [alertType, setAlertType] = useState<AlertTypeKey>(() => {
    if (searchParams.get("lowStock") === "true") return "lowStock";
    if (searchParams.get("nearExpiry") === "true") return "nearExpiry";
    if (searchParams.get("overdueMaint") === "true") return "overdueMaint";
    if (searchParams.get("onLoan") === "true") return "onLoan";
    return "all";
  });

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
    { key: "onLoan", label: "ยืมอยู่", count: alerts.onLoan },
  ];

  return (
    <div className="space-y-6">
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

      {/* Alert-type chips (single-select; "all" = union) */}
      <div className="flex flex-wrap items-center gap-2">
        {alertChips.map((c) => {
          const active = alertType === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => { setAlertType(c.key); setPage(1); }}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium border transition-colors whitespace-nowrap",
                active
                  ? c.key === "all"
                    ? "bg-primary text-primary-foreground border-transparent shadow-sm"
                    : ALERT_BADGE[c.key]
                  : "bg-background text-foreground/80 border-border hover:bg-muted",
              )}
            >
              {c.label}
              {c.count > 0 && (
                <span className={cn(
                  "inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-bold tabular-nums",
                  active ? (c.key === "all" ? "bg-white/25" : "bg-background/60") : "bg-muted text-muted-foreground",
                )}>{c.count > 9 ? "9+" : c.count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border overflow-hidden bg-card">
        <div className="overflow-auto max-h-[58dvh] lg:max-h-[calc(100vh-340px)]">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-card border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <TableHead>รหัสพัสดุ</TableHead>
                <TableHead>ชื่อ</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead>การแจ้งเตือน</TableHead>
                <TableHead>คงเหลือ</TableHead>
                <TableHead>สถานที่</TableHead>
                <TableHead>สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
                    <Badge variant="outline">{item.category.profile?.name ?? item.category.name}</Badge>
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
                  <TableCell className="text-sm tabular-nums">
                    {item.totalQty === 0 ? (
                      <span className="text-muted-foreground">-</span>
                    ) : (
                      <span className={item.availableQty < item.minThreshold ? "text-destructive font-medium" : "text-muted-foreground"}>
                        {item.availableQty === item.totalQty
                          ? item.availableQty
                          : `${item.availableQty}/${item.totalQty}`}{" "}
                        <span className="text-muted-foreground font-normal">{item.issueUnit.name}</span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{item.location ? locationLabel(item.location) : "-"}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_PILLS[item.status] || "bg-muted text-muted-foreground border-border"}`}>
                      {STATUS_LABELS[item.status] ?? item.status.replace(/_/g, " ")}
                    </span>
                  </TableCell>
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
