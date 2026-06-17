"use client";

import { Suspense, useState, useEffect, useCallback, Fragment, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, ChevronDown, QrCode, X, Package, Beaker, Hammer, Building2, Monitor, BookOpen, Puzzle, Boxes, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { STATUS_PILLS, STATUS_VARIANTS, STATUS_LABELS } from "@/lib/constants";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import { useSession } from "@/components/layout/auth-guard";
import { QrScanner } from "@/components/shared/qr-scanner";
import { useAlerts } from "@/hooks/use-alerts";
import { useCategories, useLocations } from "@/hooks/use-lookup-data";
import { usePagination } from "@/hooks/use-pagination";
import { locationLabel } from "@/lib/constants";
import { getItems, getSubItems } from "@/lib/api";
import type { CategoryOption, LocationOption, ProfileOption } from "@/lib/api";


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

function StockBar({ available, total, threshold }: { available: number; total: number; threshold: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">-</span>;
  const pct = Math.round((available / total) * 100);
  const barColor = available < threshold
    ? "bg-destructive" : pct < 50
    ? "bg-warning" : "bg-success";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs tabular-nums whitespace-nowrap ${available < threshold ? "text-destructive font-medium" : "text-muted-foreground"}`}>
        {available}/{total}
      </span>
    </div>
  );
}

const STATUS_CHIPS = [
  { value: "AVAILABLE", label: "มีอยู่", color: "bg-success/15 text-success hover:bg-success/25 border-success/30" },
  { value: "CHECKED_OUT", label: "ถูกยืม", color: "bg-info-500/15 text-info-500 hover:bg-info-500/25 border-info-500/30" },
  { value: "DAMAGED", label: "ชำรุด", color: "bg-destructive/15 text-destructive hover:bg-destructive/25 border-destructive/30" },
  { value: "UNDER_REPAIR", label: "ซ่อมอยู่", color: "bg-warning/15 text-warning-foreground hover:bg-warning/25 border-warning/30" },
  { value: "LOST", label: "สูญหาย", color: "bg-purple-500/15 text-purple-500 hover:bg-purple-500/25 border-purple-500/30" },
  { value: "DISPOSED", label: "จำหน่ายแล้ว", color: "bg-muted text-muted-foreground hover:bg-muted/80 border-border" },
  { value: "PENDING_MAINTENANCE", label: "รอบำรุง", color: "bg-cyan-500/15 text-cyan-600 hover:bg-cyan-500/25 border-cyan-500/30" },
] as const;

const PRESET_CHIPS = [
  { value: "lowStock", label: "สต๊อกต่ำ", alertKey: "lowStock" as const, color: "bg-orange-500/15 text-orange-500 hover:bg-orange-500/25 border-orange-500/30" },
  { value: "nearExpiry", label: "ใกล้หมดอายุ", alertKey: "nearExpiry" as const, color: "bg-warning/15 text-warning-foreground hover:bg-warning/25 border-warning/30" },
  { value: "overdueMaint", label: "บำรุเกินกำหนด", alertKey: "overdueMaintenance" as const, color: "bg-destructive/15 text-destructive hover:bg-destructive/25 border-destructive/30" },
] as const;

// Map profile.icon string → lucide component. Unknown → Boxes fallback.
const PROFILE_ICONS: Record<string, LucideIcon> = {
  Package, Beaker, Hammer, Building2, Monitor, BookOpen, Puzzle, Boxes,
};

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
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState(searchParams.get("category") ?? "");
  const [filterProfile, setFilterProfile] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState(searchParams.get("status") ?? "");
  const [filterLocation, setFilterLocation] = useState("");
  const [presetFilter, setPresetFilter] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  // derive profiles from categories (each carries full profile) instead of a separate getProfiles() call.
  const profiles = useMemo<ProfileOption[]>(() => {
    const map = new Map<string, ProfileOption>();
    for (const c of categories) if (c.profile) map.set(c.profile.id, c.profile);
    return [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories]);

  const scopedCategories = useMemo(
    () => (filterProfile ? categories.filter((c) => c.profile?.id === filterProfile) : categories),
    [categories, filterProfile],
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [subItemsMap, setSubItemsMap] = useState<Record<string, SubItemRecord[]>>({});

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
    setSearch(code);
    setPage(1);
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
    if (search) params.search = search;
    if (filterProfile) params.profileId = filterProfile;
    if (filterCategory) params.categoryId = filterCategory;
    if (filterStatus) params.status = filterStatus;
    if (filterLocation) params.locationId = filterLocation;
    if (presetFilter) params[presetFilter] = "true";

    const data = await getItems(params);
    setItems((data.items || []) as ItemRecord[]);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, perPage, search, filterProfile, filterCategory, filterStatus, filterLocation, presetFilter]);

  useEffect(() => {
    const low = searchParams.get("lowStock");
    const near = searchParams.get("nearExpiry");
    const over = searchParams.get("overdueMaint");
    if (low === "true") setPresetFilter("lowStock");
    else if (near === "true") setPresetFilter("nearExpiry");
    else if (over === "true") setPresetFilter("overdueMaint");
  }, [searchParams]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return (
    <div className="space-y-6">
      <Card className="p-3 space-y-3">
        {/* Row 0: profile tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-muted/40 border border-border/60">
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              !filterProfile
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background hover:text-foreground"
            }`}
            onClick={() => { setFilterProfile(""); setFilterCategory(""); setPage(1); }}
          >
            <Boxes className="h-4 w-4" />
            ทุกประเภท
          </button>
          {profiles.map((p) => {
            const active = filterProfile === p.id;
            const Icon = PROFILE_ICONS[p.icon ?? ""] ?? Boxes;
            return (
              <button
                key={p.id}
                type="button"
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-all ${
                  active
                    ? `${p.color} font-semibold shadow-sm ring-1 ring-black/5`
                    : "text-muted-foreground hover:bg-background hover:text-foreground"
                }`}
                onClick={() => { setFilterProfile(p.id); setFilterCategory(""); setPage(1); }}
              >
                <Icon className="h-4 w-4" />
                {p.name}
              </button>
            );
          })}
        </div>

        {/* Row 1: search + scan + dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหารหัส, ชื่อพัสดุ..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 text-gray-900"
            />
          </div>
          <Button type="button" variant="outline" size="icon" onClick={() => setScannerOpen(true)} aria-label="สแกน QR Code" className="shrink-0">
            <QrCode className="h-4 w-4" />
          </Button>
          <Select value={filterCategory || "__all__"} onValueChange={(v) => { setFilterCategory(!v || v === "__all__" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="ทุกหมวดหมู่ย่อย">
                {(value: string | null) => {
                  if (!value) return "ทุกหมวดหมู่ย่อย";
                  const cat = scopedCategories.find((c) => c.id === value);
                  return cat?.name ?? "ทุกหมวดหมู่ย่อย";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">ทุกหมวดหมู่ย่อย</SelectItem>
              {scopedCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterLocation || "__all__"} onValueChange={(v) => { setFilterLocation(!v || v === "__all__" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="ทุกสถานที่">
                {(value: string | null) => {
                  if (!value) return "ทุกสถานที่";
                  const loc = locations.find((l) => l.id === value);
                  return loc ? locationLabel(loc) : "ทุกสถานที่";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">ทุกสถานที่</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>{locationLabel(loc)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 2: status quick-filter chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">สถานะ:</span>
          <button
            type="button"
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              !filterStatus
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/50 text-foreground/70 border-border hover:bg-muted"
            }`}
            onClick={() => { setFilterStatus(""); setPage(1); }}
          >
            ทั้งหมด
          </button>
          {STATUS_CHIPS.map((chip) => {
            const active = filterStatus === chip.value;
            return (
              <button
                key={chip.value}
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  active ? chip.color : "bg-muted/50 text-foreground/70 border-border hover:bg-muted"
                }`}
                onClick={() => { setFilterStatus(active ? "" : chip.value); setPage(1); }}
              >
                {chip.label}
              </button>
            );
          })}

          <span className="text-xs text-muted-foreground ml-3 mr-1">Alerts:</span>
          <button
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              !presetFilter
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/50 text-foreground/70 border-border hover:bg-muted"
            }`}
            onClick={() => { setPresetFilter(null); setPage(1); }}
          >
            Off
          </button>
          {PRESET_CHIPS.map((chip) => {
            const active = presetFilter === chip.value;
            const count = alerts[chip.alertKey];
            return (
              <button
                key={chip.value}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  active ? chip.color : "bg-muted/50 text-foreground/70 border-border hover:bg-muted"
                }`}
                onClick={() => { setPresetFilter(active ? null : chip.value); setPage(1); }}
              >
                {chip.label}
                {count > 0 && (
                  <span className={`inline-flex items-center justify-center rounded-full px-1.5 min-w-[20px] h-4 text-[10px] font-bold leading-none ${
                    active
                      ? chip.value === "lowStock" ? "bg-orange-300 text-orange-900"
                        : chip.value === "nearExpiry" ? "bg-yellow-300 text-yellow-900"
                        : "bg-purple-300 text-purple-900"
                      : chip.value === "lowStock" ? "bg-orange-500 text-white"
                        : chip.value === "nearExpiry" ? "bg-yellow-500 text-white"
                        : "bg-purple-500 text-white"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="rounded-2xl border overflow-hidden bg-card">
        <div className="overflow-auto max-h-[calc(100vh-268px)]">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-card border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                <TableHead className="w-10"></TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
                      <TableCell>
                        <StockBar available={item.availableQty} total={item.totalQty} threshold={item.minThreshold} />
                      </TableCell>
                      <TableCell className="text-sm">{item.issueUnit.name}</TableCell>
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
