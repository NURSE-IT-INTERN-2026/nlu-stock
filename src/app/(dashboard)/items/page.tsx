"use client";

import { Suspense, useState, useEffect, useCallback, Fragment, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_PILLS, STATUS_LABELS, locationLabel, formatSubCode } from "@/lib/constants";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useSession } from "@/components/layout/auth-guard";
import { QrScanner } from "@/components/shared/qr-scanner";
import { useAlerts } from "@/hooks/use-alerts";
import { useCategories, useLocations } from "@/hooks/use-lookup-data";
import { usePagination } from "@/hooks/use-pagination";
import { getItems, getSubItems } from "@/lib/api";
import type { CategoryOption, LocationOption, ProfileOption } from "@/lib/api";
import { ItemsFilterBar, EMPTY_FILTER, type FilterState } from "@/components/items/items-filter-bar";


interface UnitType { id: string; name: string }

interface SubItemRecord {
  id: string;
  subCode: string;
  name: string | null;
  status: string;
  condition: string | null;
  notes: string | null;
  dispenseRecords: { staff: { name: string } }[];
}

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
}

export default function ItemsPage() {
  return (
    <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-96 w-full" /></div>}>
      <ItemsContent />
    </Suspense>
  );
}

function ItemsContent() {
  const { user } = useSession();
  const alerts = useAlerts();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ItemRecord[]>([]);
  const { categories } = useCategories();
  const { locations } = useLocations();
  const { page, setPage, perPage, total, setTotal, totalPages } = usePagination(20);
  const [loading, setLoading] = useState(true);

  // derive profiles from categories (each carries full profile) instead of a separate getProfiles() call.
  const profiles = useMemo<ProfileOption[]>(() => {
    const map = new Map<string, ProfileOption>();
    for (const c of categories) if (c.profile) map.set(c.profile.id, c.profile);
    return [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories]);

  // Initial filter from URL params (runs once).
  const [filter, setFilter] = useState<FilterState>(() => {
    const preset = searchParams.get("lowStock") === "true" ? "lowStock"
      : searchParams.get("nearExpiry") === "true" ? "nearExpiry"
      : searchParams.get("overdueMaint") === "true" ? "overdueMaint"
      : searchParams.get("onLoan") === "true" ? "onLoan"
      : null;
    const statusParam = searchParams.get("status");
    return {
      query: "",
      profileId: "",
      categoryId: searchParams.get("category"),
      status: statusParam ? statusParam.split(",").filter(Boolean) : [],
      location: {},
      preset,
    };
  });
  const handleFilterChange = useCallback((next: FilterState) => { setFilter(next); setPage(1); }, [setPage]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [mobileExpanded, setMobileExpanded] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const [isVerySmall, setIsVerySmall] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 399px)");
    const on = () => setIsVerySmall(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const toggleMobile = (id: string) => setMobileExpanded((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const [subItemsMap, setSubItemsMap] = useState<Record<string, SubItemRecord[]>>({});
  const [scannerOpen, setScannerOpen] = useState(false);

  const handleQrScan = async (code: string) => {
    setScannerOpen(false);
    try {
      const data = await getItems({ search: code, perPage: "1" });
      const match = (data.items as ItemRecord[])?.find((it: ItemRecord) => it.code === code);
      if (match) {
        router.push(`/items/${match.code}`);
        return;
      }
    } catch {}
    handleFilterChange({ ...filter, query: code });
  };

  const toggleExpand = async (itemId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) { next.delete(itemId); return next; }
      next.add(itemId);
      return next;
    });
    if (!subItemsMap[itemId]) {
      const data = await getSubItems(itemId);
      setSubItemsMap((prev) => ({ ...prev, [itemId]: data as SubItemRecord[] }));
    }
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), perPage: String(perPage) };
    if (filter.query) params.search = filter.query;
    if (filter.profileId) params.profileId = filter.profileId;
    if (filter.categoryId) params.categoryId = filter.categoryId;
    if (filter.status.length) params.status = filter.status.join(",");
    if (filter.preset) params[filter.preset] = "true";
    if (filter.location.building) params.building = filter.location.building;
    if (filter.location.floor) params.floor = filter.location.floor;
    if (filter.location.room) params.room = filter.location.room;
    if (filter.location.detail) params.detail = filter.location.detail;

    const data = await getItems(params);
    setItems((data.items || []) as ItemRecord[]);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, perPage, filter, setTotal]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return (
    <div className="flex flex-col h-full min-h-0 gap-6">
      <ItemsFilterBar
        profiles={profiles}
        categories={categories}
        locations={locations}
        alerts={alerts}
        value={filter}
        onChange={handleFilterChange}
        resultCount={total}
        onScanQR={() => setScannerOpen(true)}
        hideAlertPicker
      />

      <div className="rounded-2xl border overflow-hidden bg-card flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto [&_[data-slot=table-container]]:overflow-visible">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-card border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <TableHead className="w-28 md:w-32 max-[399px]:hidden">รหัสพัสดุ</TableHead>
                <TableHead>ชื่อ</TableHead>
                <TableHead className="hidden md:table-cell md:w-28">ประเภท</TableHead>
                <TableHead className="hidden md:table-cell md:w-24">คงเหลือ</TableHead>
                <TableHead className="hidden md:table-cell md:w-40 lg:w-56 xl:w-72">สถานที่</TableHead>
                <TableHead className="w-24 md:w-24 text-center">สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: isMobile ? (isVerySmall ? 2 : 3) : 6 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isMobile ? (isVerySmall ? 2 : 3) : 6} className="text-center text-muted-foreground py-8">
                    No items found
                  </TableCell>
                </TableRow>
              ) : items.map((item, idx) => {
                const expanded = expandedIds.has(item.id);
                const subs = subItemsMap[item.id];
                const hasSubItems = item.trackIndividually && item._count.subItems > 1;
                return (
                  <Fragment key={item.id}>
                    <TableRow
                      className={`h-12 cursor-pointer hover:bg-muted/50 transition-colors ${expanded ? "bg-orange-50/50 dark:bg-orange-950/30" : idx % 2 === 1 ? "bg-muted/40" : ""}`}
                      onClick={() => {
                        if (hasSubItems) toggleExpand(item.id);
                        else if (isMobile) toggleMobile(item.id);
                        else router.push(`/items/${item.code}`);
                      }}
                    >
                      <TableCell className="font-mono text-sm max-[399px]:hidden"><span className="block truncate">{item.code}</span></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="truncate min-w-0">
                            <span className="font-medium">{item.name}</span>
                            {item.nameEn && <span className="text-muted-foreground ml-1">({item.nameEn})</span>}
                          </span>
                          {hasSubItems && (
                            <Badge variant="outline" className="shrink-0 h-4 gap-0.5 px-1 text-[10px] bg-orange-50 text-orange-700 border-orange-200">
                              <Layers className="size-2.5" />{item._count.subItems}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="max-w-full">{item.category.profile?.name ?? item.category.name}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm tabular-nums">
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
                      <TableCell className="hidden md:table-cell text-sm"><span className="block truncate">{item.location ? locationLabel(item.location) : "-"}</span></TableCell>
                      <TableCell className="text-center">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_PILLS[item.status] || "bg-muted text-muted-foreground border-border"}`}>
                          {STATUS_LABELS[item.status] ?? item.status.replace(/_/g, " ")}
                        </span>
                      </TableCell>
                    </TableRow>
                    {expanded && subs?.map((sub) => {
                      const fullCode = formatSubCode(item.code, sub.subCode);
                      return (
                      <TableRow
                        key={sub.id}
                        className="h-12 bg-orange-50/40 dark:bg-orange-950/30 hover:bg-orange-50/60 dark:hover:bg-orange-950/40 cursor-pointer"
                        onClick={() => router.push(`/items/${item.code}/sub/${sub.subCode}`)}
                      >
                        <TableCell className="font-mono text-sm text-muted-foreground pl-6 max-[399px]:hidden">
                          <span className="block truncate max-w-[8rem]"><span className="text-orange-300/80 mr-1.5">└</span>{fullCode}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{sub.name || sub.notes || "-"}</TableCell>
                        <TableCell className="hidden md:table-cell"></TableCell>
                        <TableCell className="hidden md:table-cell"></TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {sub.status === "CHECKED_OUT" && sub.dispenseRecords?.[0]
                            ? <span className="text-blue-600">→ {sub.dispenseRecords[0].staff.name}</span>
                            : item.location ? locationLabel(item.location) : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_PILLS[sub.status] || "bg-muted text-muted-foreground border-border"}`}>
                            {STATUS_LABELS[sub.status] ?? sub.status.replace(/_/g, " ")}
                          </span>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                    {(mobileExpanded.has(item.id) || (isMobile && expanded)) && (
                      <TableRow className="md:hidden">
                        <TableCell colSpan={isVerySmall ? 2 : 3} className="bg-muted/30">
                          <div className="py-1 space-y-1.5 text-sm">
                            {isVerySmall && (
                              <div className="flex justify-between gap-3"><span className="text-muted-foreground">รหัสพัสดุ</span><span className="font-mono text-right truncate">{item.code}</span></div>
                            )}
                            <div className="flex justify-between gap-3"><span className="text-muted-foreground">ประเภท</span><span className="text-right truncate">{item.category.profile?.name ?? item.category.name}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-muted-foreground">คงเหลือ</span><span className={`tabular-nums ${item.availableQty < item.minThreshold ? "text-destructive" : ""}`}>{item.totalQty === 0 ? "-" : `${item.availableQty}${item.availableQty === item.totalQty ? "" : `/${item.totalQty}`} ${item.issueUnit.name}`}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-muted-foreground">สถานที่</span><span className="text-right truncate">{item.location ? locationLabel(item.location) : "-"}</span></div>
                            <Button size="sm" className="w-full mt-1" onClick={() => router.push(`/items/${item.code}`)}>เปิดรายละเอียด</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Fixed footer */}
        <div className="flex items-center border-t bg-card px-4 py-2 shrink-0">
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

      <QrScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleQrScan}
      />
    </div>
  );
}
