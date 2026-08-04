"use client";

import { Suspense, useState, useEffect, useCallback, Fragment, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Layers, Boxes, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { STATUS_PILLS, STATUS_LABELS, statusDisplay, locationLabel, formatSubCode, parseScannedCode, type ItemStatus } from "@/lib/constants";
import { parseItemStatusList } from "@/lib/status-utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useSession } from "@/components/layout/auth-guard";
import { QrScanner } from "@/components/shared/qr-scanner";
import { CreateKitModal } from "@/components/shared/create-kit-modal";
import { useAlerts } from "@/hooks/use-alerts";
import { useCategories, useLocations } from "@/hooks/use-lookup-data";
import { useInventoryList } from "@/hooks/use-inventory-list";
import { Pagination } from "@/components/shared/pagination";
import { getItems, getSubItems } from "@/lib/api";
import type { CategoryOption, LocationOption, ProfileOption } from "@/lib/api";
import { ItemsFilterBar, EMPTY_FILTER, type FilterState } from "@/components/items/items-filter-bar";
import { MoveLocationDialog } from "@/components/items/move-location-dialog";


interface UnitType { id: string; name: string }

interface SubItemRecord {
  id: string;
  subCode: string;
  name: string | null;
  status: ItemStatus;
  condition: string | null;
  notes: string | null;
  location: LocationOption | null;
  dispenseRecords: { staff: { name: string } }[];
}

interface ItemRecord {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  category: CategoryOption;
  trackIndividually: boolean;
  status: ItemStatus;
  issueUnit: UnitType;
  availableQty: number;
  totalQty: number;
  minThreshold: number;
  location: LocationOption | null;
  _count: { subItems: number };
  statusCounts: { available: number; inUse: number; unavailable: number };
  // Only sent when the request carries a status filter — the pieces that matched it.
  matchedSubItems?: SubItemRecord[];
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
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setIsMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const { categories } = useCategories();
  const { locations } = useLocations();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);

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
      profileId: searchParams.get("profile") ?? "",
      categoryId: searchParams.get("category"),
      status: parseItemStatusList(statusParam),
      location: {},
      preset,
    };
  });
  const {
    items, total, page, perPage, loading, isLoadingMore, hasNext,
    loadMore, setPage, refetch,
  } = useInventoryList<ItemRecord>({ isMobile, filter });
  const handleFilterChange = useCallback((next: FilterState) => { setFilter(next); setPage(1); setSelected(new Set()); }, [setPage]);
  const statusFiltering = filter.status.length > 0;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mobileExpandedId, setMobileExpandedId] = useState<string | null>(null);
  const [isVerySmall, setIsVerySmall] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 399px)");
    const on = () => setIsVerySmall(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const toggleMobile = (id: string) => setMobileExpandedId((prev) => prev === id ? null : id);
  const [subItemsMap, setSubItemsMap] = useState<Record<string, SubItemRecord[]>>({});
  const [scannerOpen, setScannerOpen] = useState(false);
  const [kitOpen, setKitOpen] = useState(false);
  const canManage = user?.role !== "INSTRUCTOR";
  const canMove = user?.role === "ADMIN" || user?.role === "STAFF";
  const desktopCols = 6 + (canMove ? 1 : 0);

  const toggleSelect = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const allOnPageSelected = items.length > 0 && items.every((it) => selected.has(it.id));
  const toggleSelectAll = () => setSelected((prev) => {
    const next = new Set(prev);
    if (items.every((it) => next.has(it.id))) items.forEach((it) => next.delete(it.id));
    else items.forEach((it) => next.add(it.id));
    return next;
  });
  const clearSelection = () => setSelected(new Set());

  const handleQrScan = async (scanned: string) => {
    setScannerOpen(false);
    const { code, copy } = parseScannedCode(scanned);
    try {
      const data = await getItems({ search: code, perPage: "1" });
      const match = (data.items as ItemRecord[])?.find((it: ItemRecord) => it.code === code);
      if (match) {
        router.push(`/items/${match.code}${copy ? `?copy=${encodeURIComponent(copy)}` : ""}`);
        return;
      }
    } catch {}
    handleFilterChange({ ...filter, query: code });
  };

  const toggleExpand = async (itemId: string) => {
    setExpandedId((prev) => prev === itemId ? null : itemId);
    if (!subItemsMap[itemId]) {
      const data = await getSubItems(itemId);
      setSubItemsMap((prev) => ({ ...prev, [itemId]: data as SubItemRecord[] }));
    }
  };

  // Clear selection when navigating pages (desktop), matching prior offset behavior.
  const goToPage = (n: number) => { setSelected(new Set()); setPage(n); };

  return (
    <div className="flex flex-col gap-6">
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
        trailingAction={canManage ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setKitOpen(true)}
            className="h-11 sm:h-12 px-3 sm:px-4 rounded-xl gap-2 w-full justify-center"
          >
            <Boxes className="size-5" />
            <span className="font-medium">จัด set อุปกรณ์</span>
          </Button>
        ) : undefined}
      />

      {/* overflow-clip (not hidden) rounds header corners without becoming a scroll container,
          so sticky header still references the viewport and iOS page scroll isn't captured. */}
      <div className="rounded-2xl border bg-card flex flex-col overflow-clip">
        <div className="[&_[data-slot=table-container]]:overflow-visible">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-card border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)] [&>th]:h-8 [&>th]:py-0 [&>th]:text-xs [&>th]:text-muted-foreground">
                {canMove && (
                  <TableHead className="hidden md:table-cell w-10 text-center">
                    <Checkbox
                      checked={allOnPageSelected}
                      indeterminate={!allOnPageSelected && items.some((it) => selected.has(it.id))}
                      onCheckedChange={toggleSelectAll}
                      aria-label="เลือกทั้งหน้า"
                    />
                  </TableHead>
                )}
                <TableHead className="w-24 md:w-28 px-2 max-[399px]:hidden">รหัสพัสดุ</TableHead>
                <TableHead className="px-2">รายการพัสดุ</TableHead>
                <TableHead className="hidden md:table-cell md:w-20 text-center">หมวดหมู่</TableHead>
                <TableHead className="hidden md:table-cell md:w-36 px-1 text-center whitespace-nowrap">ว่าง/ยืม/ไม่พร้อม</TableHead>
                <TableHead className="hidden md:table-cell md:w-32 lg:w-40 xl:w-52 md:pl-6">สถานที่</TableHead>
                <TableHead className="w-28 md:w-32 px-2 text-center">สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: isMobile ? (isVerySmall ? 2 : 3) : desktopCols }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isMobile ? (isVerySmall ? 2 : 3) : desktopCols} className="text-center text-muted-foreground py-8">
                    No items found
                  </TableCell>
                </TableRow>
              ) : items.map((item, idx) => {
                // Filtering by status: the API already shipped the matching pieces, so the row
                // opens straight onto them instead of making staff expand and re-read all copies.
                const matched = statusFiltering ? item.matchedSubItems ?? [] : null;
                const expanded = matched ? matched.length > 0 : expandedId === item.id;
                const subs = matched ?? subItemsMap[item.id];
                const hasSubItems = item.trackIndividually && item._count.subItems > 1;
                return (
                  <Fragment key={item.id}>
                    <TableRow
                      className={`h-9 cursor-pointer hover:bg-muted/50 transition-colors [&>td]:py-1 ${expanded ? "bg-orange-50/40 dark:bg-orange-950/30" : idx % 2 === 1 ? "bg-muted/40" : ""}`}
                      onClick={() => {
                        // While filtering the pieces are already shown; collapsing them would
                        // hide the answer, so the row just opens the item instead.
                        if (hasSubItems && !statusFiltering) toggleExpand(item.id);
                        else if (isMobile) toggleMobile(item.id);
                        else router.push(`/items/${item.code}`);
                      }}
                    >
                      {canMove && (
                        <TableCell className="hidden md:table-cell text-center" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} aria-label={`เลือก ${item.code}`} />
                        </TableCell>
                      )}
                      <TableCell className="font-mono text-xs px-2 max-[399px]:hidden"><span className="block truncate">{item.code}</span></TableCell>
                      <TableCell className="px-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate min-w-0">
                            <span className="font-medium">{item.name}</span>
                            {item.nameEn && <span className="text-muted-foreground ml-1">({item.nameEn})</span>}
                          </span>
                          {hasSubItems && (
                            <Badge variant="outline" className="shrink-0 h-4 gap-0.5 px-1 text-[10px] bg-orange-50 text-orange-700 border-orange-200">
                              <Layers className="size-2.5" />{matched ? `${matched.length}/${item._count.subItems}` : item._count.subItems}
                            </Badge>
                          )}
                          {item.trackIndividually && item._count.subItems === 0 && (
                            <Badge variant="outline" className="shrink-0 h-4 px-1 text-[10px] bg-amber-50 text-amber-700 border-amber-200" title="ตั้งค่า SubItem ก่อนจึงจะเบิกได้">
                              ไม่มี SubItem
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-center">
                        <Badge variant="outline" className="max-w-full justify-center">
                          <span className="truncate min-w-0">{item.category.name}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm tabular-nums text-center px-1 whitespace-nowrap">
                        <span className={item.statusCounts.available > 0 ? "font-medium text-success" : "text-muted-foreground/50"}>{item.statusCounts.available}</span>
                        <span className="text-muted-foreground/40"> / </span>
                        <span className={item.statusCounts.inUse > 0 ? "font-medium text-info-500" : "text-muted-foreground/50"}>{item.statusCounts.inUse}</span>
                        <span className="text-muted-foreground/40"> / </span>
                        <span className={item.statusCounts.unavailable > 0 ? "font-medium text-destructive" : "text-muted-foreground/50"}>{item.statusCounts.unavailable}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm md:pl-6"><span className="block truncate">{item.location ? locationLabel(item.location) : "-"}</span></TableCell>
                      <TableCell className="px-2 text-center">
                        <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[11px] font-medium leading-5 ${statusDisplay(item).cls}`}>
                          {statusDisplay(item).label}
                        </span>
                      </TableCell>
                    </TableRow>
                    {expanded && subs?.map((sub) => {
                      const fullCode = formatSubCode(item.code, sub.subCode);
                      return (
                      <TableRow
                        key={sub.id}
                        className="h-9 [&>td]:py-1 bg-orange-50/40 dark:bg-orange-950/30 hover:bg-orange-50/60 dark:hover:bg-orange-950/40 cursor-pointer"
                        onClick={() => router.push(`/items/${item.code}?copy=${sub.subCode}`)}
                      >
                        {canMove && <TableCell className="hidden md:table-cell" />}
                        <TableCell className="font-mono text-xs text-muted-foreground px-2 max-[399px]:hidden">
                          <span className="block truncate max-w-[8rem]"><span className="text-orange-300/80 mr-1.5">└</span>{fullCode}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm px-2"><span className="block truncate">{sub.name || sub.notes || item.name || "-"}</span></TableCell>
                        <TableCell className="hidden md:table-cell"></TableCell>
                        <TableCell className="hidden md:table-cell"></TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground md:pl-6">
                          <span className="block truncate">
                            {sub.status === "ON_LOAN" && sub.dispenseRecords?.[0]
                              ? <span className="text-blue-600">→ {sub.dispenseRecords[0].staff.name}</span>
                              : (sub.location ?? item.location) ? locationLabel(sub.location ?? item.location!) : "-"}
                          </span>
                        </TableCell>
                        <TableCell className="px-2 text-center">
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[11px] font-medium leading-5 ${STATUS_PILLS[sub.status] || "bg-muted text-muted-foreground border-border"}`}>
                            {STATUS_LABELS[sub.status] ?? sub.status.replace(/_/g, " ")}
                          </span>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                    {(mobileExpandedId === item.id || (isMobile && expandedId === item.id)) && (
                      <TableRow className="md:hidden">
                        <TableCell colSpan={isVerySmall ? 2 : 3} className="bg-orange-50/40 dark:bg-orange-950/30">
                          <div className="py-1 space-y-1.5 text-sm">
                            {isVerySmall && (
                              <div className="flex justify-between gap-3"><span className="text-muted-foreground">รหัสพัสดุ</span><span className="font-mono text-right truncate">{item.code}</span></div>
                            )}
                            <div className="flex justify-between gap-3"><span className="text-muted-foreground">หมวดหมู่</span><span className="text-right truncate">{item.category.name}</span></div>
                            <div className="flex justify-between gap-3"><span className="text-muted-foreground">พร้อม / ใช้ / ไม่พร้อม</span><span className="tabular-nums"><span className="font-medium text-success">{item.statusCounts.available}</span><span className="text-muted-foreground"> / </span><span className="font-medium text-info-500">{item.statusCounts.inUse}</span><span className="text-muted-foreground"> / </span><span className="font-medium text-destructive">{item.statusCounts.unavailable}</span></span></div>
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

        {selected.size > 0 && (
          <div className="flex items-center gap-3 border-t bg-primary/5 px-4 py-2 shrink-0">
            <span className="text-sm font-medium">เลือกแล้ว {selected.size} รายการ</span>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={clearSelection}>ยกเลิกเลือก</Button>
            <Button size="sm" onClick={() => setBulkMoveOpen(true)}>
              <MapPin className="size-3.5 mr-1" />ย้ายที่ตั้ง
            </Button>
          </div>
        )}

        {/* Pagination — desktop numbered, mobile load-more (cursor) */}
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
          <Pagination page={page} total={total} pageSize={perPage} onChange={goToPage} loading={loading} />
        )}
      </div>

      <QrScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleQrScan}
      />

      <CreateKitModal
        open={kitOpen}
        onClose={() => setKitOpen(false)}
        onCreated={() => {
          setKitOpen(false);
          refetch();
        }}
      />

      <MoveLocationDialog
        key={bulkMoveOpen ? "open" : "closed"}
        open={bulkMoveOpen}
        onOpenChange={setBulkMoveOpen}
        items={items.filter((i) => selected.has(i.id)).map((i) => ({ id: i.id, code: i.code, name: i.name }))}
        onSuccess={() => { clearSelection(); refetch(); }}
      />
    </div>
  );
}
