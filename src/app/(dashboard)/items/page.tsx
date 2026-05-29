"use client";

import { Suspense, useState, useEffect, useCallback, Fragment } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, ChevronDown, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/components/layout/auth-guard";
import { QrScanner } from "@/components/shared/qr-scanner";

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
      <div className="flex flex-wrap gap-2">
        {presetFilter && (
          <Badge
            variant="secondary"
            className="cursor-pointer"
            onClick={() => setPresetFilter(null)}
          >
            {presetFilter === "lowStock" ? "Low Stock" : presetFilter === "nearExpiry" ? "Near Expiry" : "Overdue Maint."}
            <span className="ml-1">&times;</span>
          </Badge>
        )}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search code, name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => setScannerOpen(true)} title="Scan QR">
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
        <Select value={filterStatus || "__all__"} onValueChange={(v) => { setFilterStatus(!v || v === "__all__" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Status">
              {(value: string | null) => {
                if (!value) return "All Status";
                return value.replace(/_/g, " ");
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Status</SelectItem>
            <SelectItem value="AVAILABLE">Available</SelectItem>
            <SelectItem value="CHECKED_OUT">Checked Out</SelectItem>
            <SelectItem value="DAMAGED">Damaged</SelectItem>
            <SelectItem value="UNDER_REPAIR">Under Repair</SelectItem>
            <SelectItem value="LOST">Lost</SelectItem>
            <SelectItem value="DISPOSED">Disposed</SelectItem>
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Available / Total</TableHead>
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
            ) : items.map((item) => {
              const expanded = expandedIds.has(item.id);
              const subs = subItemsMap[item.id];
              const hasSubItems = item.trackIndividually && item._count.subItems > 1;
              return (
                <Fragment key={item.id}>
                  <TableRow
                    className={`cursor-pointer hover:bg-muted/50 ${expanded ? "bg-muted/20" : ""}`}
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
                        <Badge variant="secondary" className="text-xs mt-0.5">
                          Tracked ({item._count.subItems})
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{CATEGORY_LABELS[item.category.category] || item.category.name}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={item.availableQty < item.minThreshold ? "text-destructive font-medium" : ""}>
                        {item.availableQty}
                      </span>
                      <span className="text-muted-foreground"> / {item.totalQty}</span>
                    </TableCell>
                    <TableCell className="text-sm">{item.issueUnit.name}</TableCell>
                    <TableCell className="text-sm">{item.location ? locationLabel(item.location) : "-"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[item.status] || "secondary"}>
                        {item.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  {expanded && subs?.map((sub) => (
                    <TableRow
                      key={sub.id}
                      className="bg-muted/30 hover:bg-muted/50 cursor-pointer"
                      onClick={() => router.push(`/items/${item.id}`)}
                    >
                      <TableCell></TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{sub.subCode}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{sub.name || sub.notes || "-"}</TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[sub.status] || "secondary"} className="text-xs">
                          {sub.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} items, page {page} of {totalPages}
          </p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <QrScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleQrScan}
      />
    </div>
  );
}
