"use client";

import { Suspense, useState, useEffect, useCallback, Fragment, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_PILLS, STATUS_LABELS, locationLabel } from "@/lib/constants";
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
  const [subItemsMap, setSubItemsMap] = useState<Record<string, SubItemRecord[]>>({});
  const [scannerOpen, setScannerOpen] = useState(false);

  const handleQrScan = async (code: string) => {
    setScannerOpen(false);
    try {
      const data = await getItems({ search: code, perPage: "1" });
      const match = (data.items as ItemRecord[])?.find((it: ItemRecord) => it.code === code);
      if (match) {
        router.push(`/items/${match.id}`);
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
    <div className="space-y-6">
      <ItemsFilterBar
        profiles={profiles}
        categories={categories}
        locations={locations}
        alerts={alerts}
        value={filter}
        onChange={handleFilterChange}
        resultCount={total}
        onScanQR={() => setScannerOpen(true)}
      />

      <div className="rounded-2xl border overflow-hidden bg-card">
        <div className="overflow-auto max-h-[58dvh] lg:max-h-[calc(100vh-300px)]">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-card border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <TableHead className="w-10"></TableHead>
                <TableHead>รหัสพัสดุ</TableHead>
                <TableHead>ชื่อ</TableHead>
                <TableHead>ประเภท</TableHead>
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
                      className={`cursor-pointer hover:bg-muted/50 transition-colors ${expanded ? "bg-orange-50/50 dark:bg-orange-950/30" : idx % 2 === 1 ? "bg-muted/40" : ""}`}
                      onClick={() => {
                        if (hasSubItems) toggleExpand(item.id);
                        else router.push(`/items/${item.id}`);
                      }}
                    >
                      <TableCell>
                        {hasSubItems && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                          >
                            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "" : "-rotate-90"}`} />
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{item.code}</TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{item.name}</span>
                          {item.nameEn && <span className="text-muted-foreground ml-1">({item.nameEn})</span>}
                        </div>
                        {item.trackIndividually && item._count.subItems > 1 && (
                          <Badge variant="outline" className="text-xs mt-0.5 bg-orange-50 text-orange-700 border-orange-200">
                            Tracked ({item._count.subItems})
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.category.profile?.name ?? item.category.name}</Badge>
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
                    {expanded && subs?.map((sub) => (
                      <TableRow
                        key={sub.id}
                        className="bg-orange-50/40 dark:bg-orange-950/30 hover:bg-orange-50/60 dark:hover:bg-orange-950/40 cursor-pointer"
                        onClick={() => router.push(`/items/${item.id}`)}
                      >
                        <TableCell></TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground pl-10">
                          <span className="text-orange-300/80 mr-1.5">└</span>{sub.subCode}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{sub.name || sub.notes || "-"}</TableCell>
                        <TableCell></TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {sub.status === "CHECKED_OUT" && sub.dispenseRecords?.[0]
                            ? <span className="text-blue-600">→ {sub.dispenseRecords[0].staff.name}</span>
                            : item.location ? locationLabel(item.location) : "-"}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_PILLS[sub.status] || "bg-muted text-muted-foreground border-border"}`}>
                            {STATUS_LABELS[sub.status] ?? sub.status.replace(/_/g, " ")}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })}
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

      <QrScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleQrScan}
      />
    </div>
  );
}
