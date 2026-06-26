"use client";

import { useState, useEffect, useCallback, useRef, useMemo, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Plus, Minus, Search, QrCode, Package, Layers, Check, X, Boxes, Beaker, Hammer, Building2, Monitor, BookOpen, Puzzle, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { useCategories, useLocations } from "@/hooks/use-lookup-data";
import { searchDispenseItems } from "@/lib/api";
import { useCart } from "@/components/dispense/cart-context";
import { QrScanner } from "@/components/shared/qr-scanner";
import { Pagination } from "@/components/dashboard/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { LocationPicker, type LocationFilter } from "@/components/items/items-filter-bar";
import type { CategoryOption, ProfileOption } from "@/lib/api";

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


const PROFILE_ICONS: Record<string, LucideIcon> = {
  Package, Beaker, Hammer, Building2, Monitor, BookOpen, Puzzle, Boxes,
};

function ProfilePicker({ profiles, value, onChange }: {
  profiles: ProfileOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = profiles.find((p) => p.id === value);
  const Icon = selected ? (PROFILE_ICONS[selected.icon] ?? Boxes) : Boxes;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props: ComponentProps<"button">) => (
          <button {...props} className={cn(
            "inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium border transition-colors",
            value ? "bg-primary/10 border-primary/40 text-foreground" : "bg-background border-border text-foreground/80 hover:bg-muted",
          )}>
            <Icon className="size-4 text-muted-foreground shrink-0" />
            <span className="min-w-0 max-w-[150px] truncate">{selected?.name ?? "ทุกประเภท"}</span>
          </button>
        )}
      />
      <PopoverContent align="start" className="w-60 p-1.5">
        <button className={cn("w-full text-left text-sm px-2 py-2 rounded-md flex items-center gap-2 hover:bg-muted", !value && "bg-primary/10 font-medium")} onClick={() => { onChange(""); setOpen(false); }}>
          <Boxes className="size-4" />
          <span className="flex-1">ทุกประเภท</span>
          {!value && <Check className="size-4 text-primary" />}
        </button>
        <div className="h-px bg-border my-1" />
        <div className="max-h-64 overflow-y-auto">
          {profiles.map((p) => {
            const PIcon = PROFILE_ICONS[p.icon] ?? Boxes;
            return (
              <button key={p.id} className={cn("w-full text-left text-sm px-2 py-2 rounded-md flex items-center gap-2 hover:bg-muted", value === p.id && "bg-primary/10 font-medium")} onClick={() => { onChange(p.id); setOpen(false); }}>
                <PIcon className="size-4 shrink-0" />
                <span className="flex-1 min-w-0 truncate">{p.name}</span>
                {value === p.id && <Check className="size-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CategoryPicker({ categories, value, onChange }: {
  categories: CategoryOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = categories.find((c) => c.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props: ComponentProps<"button">) => (
          <button {...props} className={cn(
            "inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium border transition-colors",
            value ? "bg-primary/10 border-primary/40 text-foreground" : "bg-background border-border text-foreground/80 hover:bg-muted",
          )}>
            <Layers className="size-4 text-muted-foreground shrink-0" />
            <span className="min-w-0 max-w-[150px] truncate">{selected?.name ?? "ทุกหมวดหมู่"}</span>
          </button>
        )}
      />
      <PopoverContent align="start" className="w-56 p-1.5">
        <button className={cn("w-full text-left text-sm px-2 py-2 rounded-md flex items-center gap-2 hover:bg-muted", !value && "bg-primary/10 font-medium")} onClick={() => { onChange(""); setOpen(false); }}>
          <span className="flex-1">ทุกหมวดหมู่</span>
          {!value && <Check className="size-4 text-primary" />}
        </button>
        <div className="h-px bg-border my-1" />
        <div className="max-h-64 overflow-y-auto">
          {categories.map((c) => (
            <button key={c.id} className={cn("w-full text-left text-sm px-2 py-2 rounded-md flex items-center gap-2 hover:bg-muted", value === c.id && "bg-primary/10 font-medium")} onClick={() => { onChange(c.id); setOpen(false); }}>
              <span className="flex-1 min-w-0 truncate">{c.name}</span>
              {value === c.id && <Check className="size-4 text-primary shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
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
  trackIndividually: boolean;
  category: { name: string; profile: { dispenseType: "CONSUMABLE" | "COUNT" | "ITEM"; assetTracking: boolean; setTracking: boolean; color: string } };
  lots: { id: string; lotNumber: string; expiryDate: string | null; remainingQty: number }[];
  subItems: { id: string; subCode: string; status: string; condition: string | null }[];
  location: { building: string; floor: string; room: string; detail: string | null } | null;
}

function DispenseContent() {
  const { itemCount, getItemQty, items: cartItems, updateItem, removeItem, addItem } = useCart();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const { categories } = useCategories();
  const { locations } = useLocations();
  const [filterProfile, setFilterProfile] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterLocation, setFilterLocation] = useState<LocationFilter>({});

  const profiles = useMemo<ProfileOption[]>(() => {
    const map = new Map<string, ProfileOption>();
    for (const c of categories) if (c.profile) map.set(c.profile.id, c.profile);
    return [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories]);
  const scopedCategories = filterProfile ? categories.filter((c) => c.profile?.id === filterProfile) : categories;
  const locActive = Boolean(filterLocation.building || filterLocation.floor || filterLocation.room || filterLocation.detail);
  const [loading, setLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const prevCount = useRef(itemCount);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const skipPageEffect = useRef(false);
  const PAGE_SIZE = 18;

  const debounced = useDebounce(query, 300);

  const searchItems = useCallback(async (q: string, catId: string, loc: LocationFilter, p: number, profileId: string) => {
    setLoading(true);
    try {
      const data = await searchDispenseItems({
        q,
        limit: String(PAGE_SIZE),
        page: String(p),
        categoryId: catId || undefined,
        building: loc.building || undefined,
        floor: loc.floor || undefined,
        room: loc.room || undefined,
        detail: loc.detail || undefined,
        profileId: profileId || undefined,
      });
      setItems((data.items ?? []) as SearchItem[]);
      setTotal(data.total ?? 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Filter changes → reset to page 1
  useEffect(() => {
    skipPageEffect.current = true;
    setPage(1);
    searchItems(debounced, filterCategory, filterLocation, 1, filterProfile);
  }, [debounced, filterCategory, filterLocation, filterProfile, searchItems]);

  // Page changes from pagination click
  useEffect(() => {
    if (skipPageEffect.current) {
      skipPageEffect.current = false;
      return;
    }
    searchItems(debounced, filterCategory, filterLocation, page, filterProfile);
    gridRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePageChange = (p: number) => {
    setPage(p);
  };

  const handleAdd = (item: SearchItem) => {
    const dispenseType = item.category.profile.dispenseType;
    const isConsumable = dispenseType === "CONSUMABLE";
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
        dispenseType,
        trackIndividually: false,
        issueUnit: item.issueUnit.name,
        quantity: 1,
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        subItemId: null,
        subCode: null,
        availableQty: item.availableQty,
        location: loc,
        lots: item.lots.map((l) => ({ id: l.id, lotNumber: l.lotNumber, expiryDate: l.expiryDate, quantity: l.remainingQty })),
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
        dispenseType,
        trackIndividually: true,
        issueUnit: item.issueUnit.name,
        quantity: 1,
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
        dispenseType,
        trackIndividually: false,
        issueUnit: item.issueUnit.name,
        quantity: 1,
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
      const data = await searchDispenseItems({ q: code, limit: "1", categoryId: filterCategory || undefined, building: filterLocation.building || undefined, floor: filterLocation.floor || undefined, room: filterLocation.room || undefined, detail: filterLocation.detail || undefined, profileId: filterProfile || undefined });
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
    <div className="flex flex-col h-full">
      <div className="rounded-2xl border border-border/60 bg-card p-3 sm:p-4 space-y-3 mb-4 shrink-0">
        {/* Row 1: search + scan */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-0 basis-full sm:basis-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหารหัส, ชื่อพัสดุ, หรือสแกน QR…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 sm:h-12 pl-9 sm:pl-10 pr-9 text-base rounded-xl"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="ล้างคำค้น">
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button type="button" onClick={() => setScannerOpen(true)} className="h-11 sm:h-12 px-3 sm:px-4 rounded-xl gap-2 shrink-0 w-full sm:w-auto justify-center">
            <QrCode className="size-5" />
            <span className="font-medium">สแกน QR</span>
          </Button>
        </div>

        {/* Row 2: filter pickers */}
        <div className="flex flex-wrap items-center gap-2">
          <ProfilePicker profiles={profiles} value={filterProfile} onChange={(id) => { setFilterProfile(id); setFilterCategory(""); }} />
          <CategoryPicker categories={scopedCategories} value={filterCategory} onChange={setFilterCategory} />
          <LocationPicker locations={locations} value={filterLocation} onChange={setFilterLocation} />
          <div className="basis-full sm:basis-auto flex items-center gap-3 text-sm text-muted-foreground sm:ml-auto">
            <span className="tabular-nums">
              พบ <span className="font-semibold text-foreground">{total.toLocaleString()}</span> รายการ
            </span>
            {(filterProfile || filterCategory || locActive || query) && (
              <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setFilterProfile(""); setFilterCategory(""); setFilterLocation({}); }} className="h-8 text-primary hover:text-primary hover:bg-primary/10">
                <X className="size-3.5" />
                ล้างทั้งหมด
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card className="flex-1 min-h-0 p-3 flex flex-col relative">
        <div ref={gridRef} className="flex-1 overflow-y-auto pb-1">
        {items.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {query ? "ไม่พบพัสดุที่ค้นหา" : "พิมพ์ชื่อหรือรหัสเพื่อค้นหา"}
          </p>
        ) : (
          <div className="grid grid-cols-1 min-[390px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {items.map((item) => {
              const inCart = getItemQty(item.id);
              const cartEntry = cartItems.find((c) => c.itemId === item.id);
              const atMax = !item.trackIndividually && inCart >= item.availableQty;
              return (
              <div
                key={item.id}
                className="@container flex flex-col gap-3 rounded-2xl border p-3 hover:bg-muted/50 transition-colors"
              >
                {/* Cover image — rounded square, full width */}
                <div className="w-full aspect-square rounded-xl overflow-hidden bg-muted flex items-center justify-center">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-10 w-10 text-muted-foreground/50" />
                  )}
                </div>

                {/* Content */}
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex flex-col items-start gap-1">
                    <Badge className={`text-[11px] @[15rem]:text-xs shrink-0 max-w-[140px] truncate ${item.category.profile.color ?? ""}`}>
                      {item.category.name}
                    </Badge>
                    <span className="font-mono text-xs @[15rem]:text-sm text-muted-foreground">{item.code}</span>
                  </div>
                  <span className="text-sm @[15rem]:text-base font-medium leading-snug mt-0.5 line-clamp-2 min-h-[2.25rem] @[15rem]:min-h-[2.75rem]">{item.name}</span>
                  <p className="text-xs @[15rem]:text-sm text-muted-foreground">
                    คงเหลือ: {item.trackIndividually
                      ? `${item.subItems.length} ชิ้น`
                      : `${item.availableQty} ${item.issueUnit.name}`}
                  </p>
                  <p className="text-[11px] @[15rem]:text-xs text-muted-foreground/70 truncate min-h-[0.875rem] @[15rem]:min-h-[1rem]">
                    {(item.location && !locActive)
                      ? [item.location.building, item.location.floor, item.location.room, item.location.detail].filter(Boolean).join(" / ")
                      : ""}
                  </p>

                  {/* Qty control — bottom row, in flow */}
                  <div className="mt-auto pt-2 flex justify-end">
                    {inCart > 0 && cartEntry ? (
                      <div className="flex w-full items-center justify-between gap-0.5 bg-background border rounded-full px-0.5">
                        <button
                          className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (cartEntry.quantity <= 1) {
                              removeItem(item.id, cartEntry.lotId, cartEntry.subItemId);
                            } else {
                              updateItem(item.id, { quantity: cartEntry.quantity - 1 }, cartEntry.lotId, cartEntry.subItemId);
                            }
                          }}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <CardEditableQty
                          value={inCart}
                          max={!item.trackIndividually ? item.availableQty : undefined}
                          onChange={(v) => {
                            updateItem(item.id, { quantity: v }, cartEntry.lotId, cartEntry.subItemId);
                          }}
                        />
                        <button
                          className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors disabled:opacity-30"
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
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="h-8 w-full flex items-center justify-center rounded-full border bg-background hover:bg-muted transition-colors disabled:opacity-30"
                        onClick={(e) => { e.stopPropagation(); handleAdd(item); }}
                        disabled={!item.trackIndividually && item.availableQty <= 0}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
        </div>

        <Pagination
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          onChange={handlePageChange}
        />
        {loading && items.length > 0 && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] rounded-xl flex items-center justify-center z-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        )}
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
