"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Plus, Minus, Search, QrCode, X, Dices } from "lucide-react";
import { pic } from "@/lib/image";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { useCategories, useLocations } from "@/hooks/use-lookup-data";
import { searchDispenseItems } from "@/lib/api";
import { useCart, buildCartItem } from "@/components/dispense/cart-context";
import { QrScanner } from "@/components/shared/qr-scanner";
import { Pagination } from "@/components/dashboard/pagination";
import { CategoryPicker, LocationPicker, type LocationFilter } from "@/components/items/items-filter-bar";
import type { ProfileOption } from "@/lib/api";

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
        className="w-9 h-9 text-center text-sm font-semibold tabular-nums bg-background border rounded-full px-0 outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    );
  }

  return (
    <button
      className="min-w-8 h-9 text-center text-sm font-semibold tabular-nums"
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
  trackIndividually: boolean;
  category: { name: string; profile: { name: string; dispenseType: "CONSUMABLE" | "COUNT" | "ITEM"; assetTracking: boolean; setTracking: boolean; color: string } };
  lots: { id: string; lotNumber: string; expiryDate: string | null; remainingQty: number }[];
  subItems: { id: string; subCode: string; status: string; condition: string | null }[];
  location: { building: string; floor: string; room: string; detail: string | null } | null;
}

function DispenseContent() {
  const { itemCount, getItemQty, items: cartItems, updateItem, removeItem, addItem } = useCart();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [items, setItems] = useState<SearchItem[]>([]);
  const { categories } = useCategories();
  const { locations } = useLocations();
  const [filterProfile, setFilterProfile] = useState(searchParams.get("profile") ?? "");
  const [filterCategory, setFilterCategory] = useState(searchParams.get("category") ?? "");
  const [filterLocation, setFilterLocation] = useState<LocationFilter>(() => ({
    building: searchParams.get("building") ?? undefined,
    floor: searchParams.get("floor") ?? undefined,
    room: searchParams.get("room") ?? undefined,
    detail: searchParams.get("detail") ?? undefined,
  }));

  const profiles = useMemo<ProfileOption[]>(() => {
    const map = new Map<string, ProfileOption>();    for (const c of categories) if (c.profile) map.set(c.profile.id, c.profile);
    return [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories]);
  const locActive = Boolean(filterLocation.building || filterLocation.floor || filterLocation.room || filterLocation.detail);
  const [loading, setLoading] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);
  const prevCount = useRef(itemCount);
  const [page, setPage] = useState(() => Number(searchParams.get("page")) || 1);
  const [total, setTotal] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const skipPageEffect = useRef(false);
  const restoredScroll = useRef(false);
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

  // Sync filters to URL so back-navigation restores them
  useEffect(() => {
    const p = new URLSearchParams();
    if (debounced) p.set("q", debounced);
    if (filterProfile) p.set("profile", filterProfile);
    if (filterCategory) p.set("category", filterCategory);
    if (filterLocation.building) p.set("building", filterLocation.building);
    if (filterLocation.floor) p.set("floor", filterLocation.floor);
    if (filterLocation.room) p.set("room", filterLocation.room);
    if (filterLocation.detail) p.set("detail", filterLocation.detail);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    router.replace(qs ? `/dispense?${qs}` : "/dispense", { scroll: false });
  }, [debounced, filterProfile, filterCategory, filterLocation, page, router]);

  // Restore grid scroll position after back-navigation
  useEffect(() => {
    if (restoredScroll.current || items.length === 0) return;
    const saved = Number(sessionStorage.getItem("dispense-scroll"));
    if (saved) gridRef.current?.scrollTo({ top: saved });
    restoredScroll.current = true;
    sessionStorage.removeItem("dispense-scroll");
  }, [items]);

  const handlePageChange = (p: number) => {
    setPage(p);
  };

  const handleAdd = (item: SearchItem): boolean => {
    const usedSubIds = new Set(cartItems.filter((c) => c.itemId === item.id).map((c) => c.subItemId));
    const result = buildCartItem(
      {
        id: item.id,
        code: item.code,
        name: item.name,
        imageUrl: item.imageUrl,
        categoryName: item.category.name,
        dispenseType: item.category.profile.dispenseType,
        trackIndividually: item.trackIndividually,
        issueUnit: item.issueUnit.name,
        availableQty: item.availableQty,
        location: item.location
          ? { building: item.location.building, floor: item.location.floor, room: item.location.room, detail: item.location.detail }
          : null,
        lots: item.lots.map((l) => ({ id: l.id, lotNumber: l.lotNumber, expiryDate: l.expiryDate, remainingQty: l.remainingQty })),
        subItems: item.subItems.map((s) => ({ id: s.id, subCode: s.subCode, condition: s.condition })),
      },
      usedSubIds,
    );
    if (!result.ok) {
      toast.error(result.reason === "no-sub" ? "ไม่มีหน่วยย่อยให้เบิกเพิ่ม" : "สต๊อกหมดแล้ว", { id: result.reason });
      return false;
    }
    addItem(result.cartItem);
    return true;
  };

  // ponytail: dev test helper — randomly add up to 10 items from the current list into the
  // cart, guaranteeing ≥1 item per profile (ประเภท) so every type is covered.
  const handleAutoAdd = () => {
    const pool = items.filter((it) => (it.trackIndividually ? it.subItems.length > 0 : it.availableQty > 0));
    const byProfile = new Map<string, SearchItem[]>();
    for (const it of pool) {
      const key = it.category.profile.name;
      if (!byProfile.has(key)) byProfile.set(key, []);
      byProfile.get(key)!.push(it);
    }
    const pickRand = (arr: SearchItem[]) => arr[Math.floor(Math.random() * arr.length)];

    // 1 random per profile first → covers every type.
    const picks: SearchItem[] = [];
    for (const list of byProfile.values()) picks.push(pickRand(list));

    // fill the rest up to 10 from the remaining pool.
    const pickedIds = new Set(picks.map((p) => p.id));
    const rest = pool.filter((it) => !pickedIds.has(it.id)).sort(() => Math.random() - 0.5);
    for (const it of rest) {
      if (picks.length >= 10) break;
      picks.push(it);
    }
    picks.sort(() => Math.random() - 0.5);

    const added = picks.filter(handleAdd).length;
    if (added > 0) toast.success(`สุ่มเพิ่ม ${added} รายการเข้าตะกร้า (ครบ ${byProfile.size} ประเภท)`);
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
        toast.error(`ไม่พบรหัส "${code}"`, { id: "qr-not-found" });
      }
    } catch {
      toast.error("ค้นหาไม่สำเร็จ", { id: "qr-fail" });
    } finally {
      setLoading(false);
    }
  };


return (
    <div className="flex flex-col h-full">
      <div className="rounded-2xl border border-border/60 bg-card p-3 sm:p-4 space-y-3 mb-4 shrink-0">
        {/* Row 1: search + scan */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหารหัส / ชื่อพัสดุ…"
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
          <Button type="button" onClick={() => setScannerOpen(true)} aria-label="สแกน QR" className="h-11 sm:h-12 w-11 sm:w-auto px-0 sm:px-4 rounded-xl gap-2 shrink-0 justify-center">
            <QrCode className="size-5" />
            <span className="font-medium hidden sm:inline">สแกน QR</span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleAutoAdd}
            disabled={items.length === 0}
            aria-label="สุ่มเพิ่มพัสดุจาก list เข้าตะกร้า"
            title="สุ่มเพิ่มพัสดุจาก list เข้าตะกร้า (≤10 ชิ้น, ครบทุกประเภท)"
            className="h-11 sm:h-12 w-11 sm:w-auto px-0 sm:px-4 rounded-xl gap-2 shrink-0 justify-center"
          >
            <Dices className="size-5" />
            <span className="font-medium hidden sm:inline">สุ่มเพิ่ม</span>
          </Button>
        </div>

        {/* Row 2: filter pickers */}
        <div className="flex flex-wrap items-center gap-2">
          <CategoryPicker
            profiles={profiles}
            categories={categories}
            value={{ profileId: filterProfile, categoryId: filterCategory || null }}
            onChange={({ profileId, categoryId }) => { setFilterProfile(profileId); setFilterCategory(categoryId ?? ""); }}
          />
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {items.map((item) => {
              const inCart = getItemQty(item.id);
              const cartEntry = cartItems.find((c) => c.itemId === item.id);
              const atMax = !item.trackIndividually && inCart >= item.availableQty;
              return (
              <div
                key={item.id}
                className="@container flex flex-col gap-3 rounded-2xl border p-3 hover:bg-muted/50 transition-colors"
              >
                <Link
                  href={`/items/${item.id}`}
                  onClick={() => sessionStorage.setItem("dispense-scroll", String(gridRef.current?.scrollTop ?? 0))}
                  className="flex flex-col flex-1 min-w-0 gap-3 text-left"
                >
                  {/* Cover image — rounded square, full width */}
                  <div className="w-full aspect-square rounded-xl overflow-hidden bg-muted">
                    <img src={item.imageUrl ?? pic(item.code)} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
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
                  </div>
                </Link>

                {/* Qty control — bottom row, in flow */}
                <div className="pt-2 flex justify-end">
                    {inCart > 0 && cartEntry ? (
                      <div className="animate-cart-pop flex w-full items-center justify-between gap-0.5 bg-background border rounded-full px-0.5">
                        <button
                          className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors active:scale-90"
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
                          className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors active:scale-90 disabled:opacity-30"
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
                        className="h-9 w-full flex items-center justify-center rounded-full border bg-background hover:bg-muted transition-colors active:scale-95 disabled:opacity-30"
                        onClick={(e) => { e.stopPropagation(); handleAdd(item); }}
                        disabled={!item.trackIndividually && item.availableQty <= 0}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    )}
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
