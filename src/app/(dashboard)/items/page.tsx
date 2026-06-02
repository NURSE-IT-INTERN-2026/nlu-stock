"use client";

import { Suspense, useState, useEffect, useCallback, Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, ChevronDown, QrCode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
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

interface CategoryType {
  id: string;
  name: string;
  category: string;
}

interface Location {
  id: string;
  building: string;
  floor: string;
  room: string;
  detail: string | null;
}

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
  category: CategoryType;
  trackIndividually: boolean;
  status: string;
  issueUnit: UnitType;
  availableQty: number;
  totalQty: number;
  minThreshold: number;
  location: Location | null;
  _count: { subItems: number };
}

const CATEGORY_LABELS: Record<string, string> = {
  KRU: "ครุภัณฑ์",
  ELE: "อิเล็กทรอนิกส์",
  BOOK: "หนังสือ",
  TOY: "ของเล่น",
  DUR: "วัสดุคงทน",
  CON: "วัสดุสิ้นเปลือง",
  MED: "ยา",
  KIT: "อุปกรณ์ประกอบวิชา",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  AVAILABLE: "default",
  CHECKED_OUT: "secondary",
  DAMAGED: "destructive",
  UNDER_REPAIR: "secondary",
  LOST: "destructive",
  DISPOSED: "destructive",
  PENDING_MAINTENANCE: "secondary",
};

const STATUS_PILLS: Record<string, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CHECKED_OUT: "bg-blue-100 text-blue-800 border-blue-200",
  DAMAGED: "bg-red-100 text-red-800 border-red-200",
  UNDER_REPAIR: "bg-amber-100 text-amber-800 border-amber-200",
  LOST: "bg-gray-100 text-gray-700 border-gray-200",
  DISPOSED: "bg-gray-200 text-gray-800 border-gray-300",
  PENDING_MAINTENANCE: "bg-amber-100 text-amber-800 border-amber-200",
};

function StockBar({ available, total, threshold }: { available: number; total: number; threshold: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">-</span>;
  const pct = Math.round((available / total) * 100);
  const barColor = available < threshold
    ? "bg-red-500" : pct < 50
    ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs tabular-nums whitespace-nowrap ${available < threshold ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
        {available}/{total}
      </span>
    </div>
  );
}

const STATUS_CHIPS = [
  { value: "AVAILABLE", label: "Available", color: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-300" },
  { value: "CHECKED_OUT", label: "Checked Out", color: "bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-300" },
  { value: "DAMAGED", label: "Damaged", color: "bg-red-100 text-red-800 hover:bg-red-200 border-red-300" },
  { value: "UNDER_REPAIR", label: "Under Repair", color: "bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-300" },
  { value: "LOST", label: "Lost", color: "bg-slate-200 text-slate-800 hover:bg-slate-300 border-slate-400" },
  { value: "DISPOSED", label: "Disposed", color: "bg-zinc-200 text-zinc-800 hover:bg-zinc-300 border-zinc-400" },
] as const;

const PRESET_CHIPS = [
  { value: "lowStock", label: "Low Stock", alertKey: "lowStock" as const, color: "bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-300" },
  { value: "nearExpiry", label: "Near Expiry", alertKey: "nearExpiry" as const, color: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-300" },
  { value: "overdueMaint", label: "Overdue Maint.", alertKey: "overdueMaintenance" as const, color: "bg-purple-100 text-purple-800 hover:bg-purple-200 border-purple-300" },
] as const;

function locationLabel(loc: Location) {
  return [loc.building, loc.floor, loc.room, loc.detail].filter(Boolean).join(" / ");
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
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState(searchParams.get("category") ?? "");
  const [filterStatus, setFilterStatus] = useState(searchParams.get("status") ?? "");
  const [filterLocation, setFilterLocation] = useState("");
  const [presetFilter, setPresetFilter] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [subItemsMap, setSubItemsMap] = useState<Record<string, SubItemRecord[]>>({});

  const handleQrScan = async (code: string) => {
    setScannerOpen(false);
    try {
      const res = await fetch(`/api/items?search=${encodeURIComponent(code)}&perPage=1`);
      const data = await res.json();
      const match = data.items?.find((it: ItemRecord) => it.code === code);
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
      const res = await fetch(`/api/settings/items/${itemId}/sub-items`);
      const data = await res.json();
      setSubItemsMap((prev) => ({ ...prev, [itemId]: data }));
    }
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    if (search) params.set("search", search);
    if (filterCategory) params.set("categoryId", filterCategory);
    if (filterStatus) params.set("status", filterStatus);
    if (filterLocation) params.set("locationId", filterLocation);
    if (presetFilter) params.set(presetFilter, "true");

    const res = await fetch(`/api/items?${params}`);
    const data = await res.json();
    setItems(data.items || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, perPage, search, filterCategory, filterStatus, filterLocation, presetFilter]);

  useEffect(() => {
    fetch("/api/settings/categories").then((r) => r.json()).then(setCategories);
    fetch("/api/settings/locations").then((r) => r.json()).then(setLocations);
  }, []);

  useEffect(() => {
    const low = searchParams.get("lowStock");
    const near = searchParams.get("nearExpiry");
    const over = searchParams.get("overdueMaint");
    if (low === "true") setPresetFilter("lowStock");
    else if (near === "true") setPresetFilter("nearExpiry");
    else if (over === "true") setPresetFilter("overdueMaint");
  }, [searchParams]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="space-y-4">
      <Card className="p-3 space-y-3">
        {/* Row 1: search + scan + dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search code, name..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-8"
            />
          </div>
          <Button variant="outline" size="icon" onClick={() => setScannerOpen(true)} title="Scan QR" className="shrink-0">
            <QrCode className="h-4 w-4" />
          </Button>
          <Select value={filterCategory || "__all__"} onValueChange={(v) => { setFilterCategory(!v || v === "__all__" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Categories">
                {(value: string | null) => {
                  if (!value) return "All Categories";
                  const cat = categories.find((c) => c.id === value);
                  return cat?.name ?? "All Categories";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Categories</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterLocation || "__all__"} onValueChange={(v) => { setFilterLocation(!v || v === "__all__" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Locations">
                {(value: string | null) => {
                  if (!value) return "All Locations";
                  const loc = locations.find((l) => l.id === value);
                  return loc ? locationLabel(loc) : "All Locations";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Locations</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>{locationLabel(loc)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Row 2: status quick-filter chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Status:</span>
          <button
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              !filterStatus
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/50 text-foreground/70 border-border hover:bg-muted"
            }`}
            onClick={() => { setFilterStatus(""); setPage(1); }}
          >
            All
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
        <div className="overflow-auto max-h-[calc(100vh-260px)]">
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
                        <Badge variant="outline">{CATEGORY_LABELS[item.category.category] || item.category.name}</Badge>
                      </TableCell>
                      <TableCell>
                        <StockBar available={item.availableQty} total={item.totalQty} threshold={item.minThreshold} />
                      </TableCell>
                      <TableCell className="text-sm">{item.issueUnit.name}</TableCell>
                      <TableCell className="text-sm">{item.location ? locationLabel(item.location) : "-"}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_PILLS[item.status] || "bg-muted text-muted-foreground border-border"}`}>
                          {item.status.replace(/_/g, " ")}
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
                          <div className="border-l-2 border-orange-300 pl-3">{sub.subCode}</div>
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
                            {sub.status.replace(/_/g, " ")}
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
