"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Plus, Minus, Search, QrCode, Package } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { useCategories, useLocations } from "@/hooks/use-lookup-data";
import { Category, locationLabel, CATEGORY_COLORS } from "@/lib/constants";
import { searchDispenseItems } from "@/lib/api";
import { useCart } from "@/components/dispense/cart-context";
import { QrScanner } from "@/components/shared/qr-scanner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function CardEditableQty({ value, max, onChange }: {
  value: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={1}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = parseInt(draft) || 1;
          const clamped = Math.max(1, max ? Math.min(v, max) : v);
          onChange(clamped);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setDraft(String(value));
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-6 h-6 text-center text-xs font-semibold tabular-nums bg-background border rounded-full px-0 outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    );
  }

  return (
    <button
      className="w-5 text-center text-xs font-semibold tabular-nums"
      onClick={(e) => {
        e.stopPropagation();
        setDraft(String(value));
        setEditing(true);
      }}
    >
      {value}
    </button>
  );
}


interface SearchItem {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  imageUrl: string | null;
  availableQty: number;
  issueUnit: { id: string; name: string };
  subUnit: { id: string; name: string };
  conversionFactor: number;
  trackIndividually: boolean;
  category: { name: string; category: string };
  lots: { id: string; lotNumber: string; expiryDate: string | null; quantity: number }[];
  subItems: { id: string; subCode: string; status: string; condition: string | null }[];
  location: { building: string; floor: string; room: string; detail: string | null } | null;
}

function DispenseContent() {
  const { itemCount, getItemQty, items: cartItems, updateItem, removeItem, addItem } = useCart();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const { categories } = useCategories();
  const { locations } = useLocations();
  const [filterCategory, setFilterCategory] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const prevCount = useRef(itemCount);

  const debounced = useDebounce(query, 300);

  const searchItems = useCallback(async (q: string, catId: string, locId: string) => {
    setLoading(true);
    try {
      const data = await searchDispenseItems({ q, limit: "200", categoryId: catId || undefined, locationId: locId || undefined });
      setItems((data.items ?? []) as SearchItem[]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    searchItems(debounced, filterCategory, filterLocation);
  }, [debounced, filterCategory, filterLocation, searchItems]);

  const handleAdd = (item: SearchItem) => {
    const categoryType = item.category.category as "KRU" | "ELE" | "BOOK" | "TOY" | "DUR" | "CON" | "MED" | "KIT";
    const isConsumable = categoryType === "CON" || categoryType === "MED";
    const isTracked = item.trackIndividually && item.subItems.length > 0;

    const loc = item.location ? { building: item.location.building, floor: item.location.floor, room: item.location.room, detail: item.location.detail } : null;

    if (isConsumable && item.lots.length > 0) {
      // Auto-pick FIFO lot (lots already sorted by expiry ASC from API)
      const lot = item.lots[0];
      addItem({
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        imageUrl: item.imageUrl,
        categoryName: item.category.name,
        categoryType,
        trackIndividually: false,
        issueUnit: item.issueUnit.name,
        subUnit: item.subUnit.name,
        conversionFactor: item.conversionFactor,
        quantity: 1,
        quantitySub: 0,
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        subItemId: null,
        subCode: null,
        availableQty: item.availableQty,
        location: loc,
        lots: item.lots.map((l) => ({ id: l.id, lotNumber: l.lotNumber, expiryDate: l.expiryDate, quantity: l.quantity })),
        subItems: [],
      });
    } else if (isTracked) {
      // Auto-pick next available sub-item not already in cart
      const usedSubIds = new Set(cartItems.filter((c) => c.itemId === item.id).map((c) => c.subItemId));
      const nextSub = item.subItems.find((s) => !usedSubIds.has(s.id));
      if (!nextSub) {
        toast.error("No more available sub-items", { id: "no-sub" });
        return;
      }
      addItem({
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        imageUrl: item.imageUrl,
        categoryName: item.category.name,
        categoryType,
        trackIndividually: true,
        issueUnit: item.issueUnit.name,
        subUnit: item.subUnit.name,
        conversionFactor: item.conversionFactor,
        quantity: 1,
        quantitySub: 0,
        lotId: null,
        lotNumber: null,
        subItemId: nextSub.id,
        subCode: nextSub.subCode,
        availableQty: item.availableQty,
        location: loc,
        lots: [],
        subItems: item.subItems.map((s) => ({ id: s.id, subCode: s.subCode })),
      });
    } else {
      // Simple item or consumable without lots — just add qty 1
      if (item.availableQty <= 0) {
        toast.error("Item out of stock", { id: "no-stock" });
        return;
      }
      const hasSingleSubItem = item.trackIndividually && item.subItems.length === 1;
      addItem({
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        imageUrl: item.imageUrl,
        categoryName: item.category.name,
        categoryType,
        trackIndividually: false,
        issueUnit: item.issueUnit.name,
        subUnit: item.subUnit.name,
        conversionFactor: item.conversionFactor,
        quantity: 1,
        quantitySub: 0,
        lotId: null,
        lotNumber: null,
        subItemId: hasSingleSubItem ? item.subItems[0].id : null,
        subCode: hasSingleSubItem ? item.subItems[0].subCode : null,
        availableQty: item.availableQty,
        location: loc,
        lots: [],
        subItems: [],
      });
    }
  };

  const handleQrScan = async (code: string) => {
    setLoading(true);
    try {
      const data = await searchDispenseItems({ q: code, limit: "1", categoryId: filterCategory || undefined, locationId: filterLocation || undefined });
      const items = (data.items ?? []) as SearchItem[];
      const found = items[0];
      if (found && found.code === code) {
        handleAdd(found);
      } else {
        toast.error(`Item "${code}" not found`, { id: "qr-not-found" });
      }
    } catch {
      toast.error("Search failed", { id: "qr-fail" });
    } finally {
      setLoading(false);
    }
  };


return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <Card className="p-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search code, name..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button variant="outline" size="icon" onClick={() => setScannerOpen(true)} title="Scan QR" className="shrink-0">
            <QrCode className="h-4 w-4" />
          </Button>
          <Select value={filterCategory || "__all__"} onValueChange={(v) => setFilterCategory(!v || v === "__all__" ? "" : v)}>
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
          <Select value={filterLocation || "__all__"} onValueChange={(v) => setFilterLocation(!v || v === "__all__" ? "" : v)}>
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
      </Card>

      <Card className="flex-1 min-h-0 p-3 flex flex-col">
        <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {query ? "No items found" : "Type to search items"}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 items-start">
            {items.map((item) => (
              <div
                key={item.id}
                className="relative flex items-start gap-3 rounded-2xl border p-3 h-[142px] hover:bg-muted/50 transition-colors"
              >
                {/* Cover image */}
                <div className="h-28 w-28 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-6 w-6 text-muted-foreground/50" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[15px] text-muted-foreground">{item.code}</span>
                    <Badge className={`text-[13px] ${CATEGORY_COLORS[item.category.category as Category] ?? ""}`}>
                      {item.category.name}
                    </Badge>
                  </div>
                  <p className="text-[17px] font-medium line-clamp-2">{item.name}</p>
                  <p className="text-[15px] text-muted-foreground">
                    Available: {item.trackIndividually
                      ? `${item.subItems.length} units`
                      : `${item.availableQty} ${item.issueUnit.name}`}
                  </p>
                  {item.location && !filterLocation && (
                    <p className="text-xs text-muted-foreground/70 truncate">
                      {[item.location.building, item.location.floor, item.location.room, item.location.detail].filter(Boolean).join(" / ")}
                    </p>
                  )}
                </div>
                {/* Qty control bottom-right */}
                {(() => {
                  const inCart = getItemQty(item.id);
                  const cartEntry = cartItems.find((c) => c.itemId === item.id);
                  const atMax = !item.trackIndividually && inCart >= item.availableQty;
                  if (inCart > 0 && cartEntry) {
                    return (
                      <div className="absolute bottom-2 right-2 flex items-center gap-0.5 bg-background border rounded-full px-0.5">
                        <button
                          className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (cartEntry.quantity <= 1) {
                              removeItem(item.id, cartEntry.lotId, cartEntry.subItemId);
                            } else {
                              updateItem(item.id, { quantity: cartEntry.quantity - 1 }, cartEntry.lotId, cartEntry.subItemId);
                            }
                          }}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <CardEditableQty
                          value={inCart}
                          max={!item.trackIndividually ? item.availableQty : undefined}
                          onChange={(v) => {
                            updateItem(item.id, { quantity: v }, cartEntry.lotId, cartEntry.subItemId);
                          }}
                        />
                        <button
                          className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-muted transition-colors disabled:opacity-30"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (atMax) return;
                            if (item.trackIndividually) {
                              handleAdd(item);
                            } else {
                              updateItem(item.id, { quantity: cartEntry.quantity + 1 }, cartEntry.lotId, cartEntry.subItemId);
                            }
                          }}
                          disabled={atMax}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  }
                  return (
                    <button
                      className="absolute bottom-2 right-2 h-7 w-7 flex items-center justify-center rounded-full border bg-background hover:bg-muted transition-colors disabled:opacity-30"
                      onClick={(e) => { e.stopPropagation(); handleAdd(item); }}
                      disabled={!item.trackIndividually && item.availableQty <= 0}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
        </div>
      </Card>

      <QrScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleQrScan}
      />
    </div>
  );
}

export default function DispensePage() {
  return <DispenseContent />;
}
