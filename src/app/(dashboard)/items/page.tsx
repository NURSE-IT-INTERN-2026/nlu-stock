"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, QrCode } from "lucide-react";
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
  room: string;
  cabinet: string | null;
  shelf: string | null;
}

interface ItemRecord {
  id: string;
  code: string;
  name: string;
  nameTh: string | null;
  category: CategoryType;
  trackIndividually: boolean;
  status: string;
  issueUnit: string;
  availableQty: number;
  totalQty: number;
  minThreshold: number;
  location: Location | null;
  _count: { subItems: number };
}

const CATEGORY_LABELS: Record<string, string> = {
  CONSUMABLE: "สิ้นเปลือง",
  DURABLE: "คงทน",
  FIXED_ASSET: "ครุพันธุ์",
  BOOK: "หนังสือ",
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
  return [loc.room, loc.cabinet, loc.shelf].filter(Boolean).join(" / ");
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
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState(searchParams.get("status") ?? "");
  const [filterLocation, setFilterLocation] = useState("");
  const [presetFilter, setPresetFilter] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const handleQrScan = (code: string) => {
    setSearch(code);
    setPage(1);
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
        <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v === "__all__" ? "" : (v ?? "")); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === "__all__" ? "" : (v ?? "")); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Status" /></SelectTrigger>
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
        <Select value={filterLocation} onValueChange={(v) => { setFilterLocation(v === "__all__" ? "" : (v ?? "")); setPage(1); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Locations" /></SelectTrigger>
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
            ) : items.map((item) => (
              <TableRow
                key={item.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/items/${item.id}`)}
              >
                <TableCell className="font-mono text-sm">{item.code}</TableCell>
                <TableCell>
                  <div>
                    <span className="font-medium">{item.name}</span>
                    {item.nameTh && <span className="text-muted-foreground ml-1">({item.nameTh})</span>}
                  </div>
                  {item.trackIndividually && (
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
                <TableCell className="text-sm">{item.issueUnit}</TableCell>
                <TableCell className="text-sm">{item.location ? locationLabel(item.location) : "-"}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANTS[item.status] || "secondary"}>
                    {item.status.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
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
