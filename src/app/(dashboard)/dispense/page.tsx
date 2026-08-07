"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Plus, Minus, Search, QrCode, X, Dices, MapPin } from "lucide-react";
import { ItemThumb } from "@/components/shared/item-thumb";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { useCategories, useLocations } from "@/hooks/use-lookup-data";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePagedList } from "@/hooks/use-paged-list";
import { searchDispenseItems } from "@/lib/api";
import { PAGE_SIZE } from "@/lib/pagination-constants";
import { parseScannedCode, STATUS_LABELS } from "@/lib/constants";
import { isManualHold } from "@/lib/status-utils";
import type { ItemStatus } from "@/generated/prisma/enums";
import { useCart, buildCartItem } from "@/components/dispense/cart-context";
import { QrScanner } from "@/components/shared/qr-scanner";
import { Pagination } from "@/components/shared/pagination";
import { CategoryPicker, LocationPicker, type LocationFilter } from "@/components/items/items-filter-bar";
import type { ProfileOption } from "@/lib/api";


interface SearchItem {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  imageUrl: string | null;
  availableQty: number;
  status: ItemStatus;
  issueUnit: { id: string; name: string };
  trackIndividually: boolean;
  category: { name: string; profile: { name: string; dispenseType: "CONSUMABLE" | "COUNT" | "ITEM"; assetTracking: boolean; setTracking: boolean; color: string } };
  lots: { id: string; lotNumber: string; expiryDate: string | null; remainingQty: number }[];
  subItems: { id: string; subCode: string; status: string; condition: string | null }[];
  location: { building: string; floor: string; room: string; detail: string | null } | null;
}

function DispenseContent() {
  const { getItemQty, items: cartItems, updateItem, removeItem, addItem } = useCart();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const { categories } = useCategories();
  const { locations } = useLocations();
  const isMobile = useIsMobile();
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
  const [scannerOpen, setScannerOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounce(query, 300);

  const fetchPage = useCallback(async (p: number) => {
    try {
      const data = await searchDispenseItems({
        q: debounced,
        perPage: String(PAGE_SIZE.DEFAULT),
        page: String(p),
        categoryId: filterCategory || undefined,
        building: filterLocation.building || undefined,
        floor: filterLocation.floor || undefined,
        room: filterLocation.room || undefined,
        detail: filterLocation.detail || undefined,
        profileId: filterProfile || undefined,
      });
      return { items: (data.items ?? []) as SearchItem[], total: data.total ?? 0 };
    } catch {
      return { items: [], total: 0 };
    }
  }, [debounced, filterCategory, filterLocation, filterProfile]);

  const {
    items, total, page, loading, isLoadingMore, hasNext, loadMore, setPage,
  } = usePagedList<SearchItem>({ fetchPage, pageSize: PAGE_SIZE.DEFAULT, isMobile });

  // Sync filters to URL so back-navigation restores them. Page is loadMore/numbered session
  // state — not URL-driven — so mobile accumulate and desktop numbered both start fresh on load.
  useEffect(() => {
    const p = new URLSearchParams();
    if (debounced) p.set("q", debounced);
    if (filterProfile) p.set("profile", filterProfile);
    if (filterCategory) p.set("category", filterCategory);
    if (filterLocation.building) p.set("building", filterLocation.building);
    if (filterLocation.floor) p.set("floor", filterLocation.floor);
    if (filterLocation.room) p.set("room", filterLocation.room);
    if (filterLocation.detail) p.set("detail", filterLocation.detail);
    const qs = p.toString();
    router.replace(qs ? `/dispense?${qs}` : "/dispense", { scroll: false });
  }, [debounced, filterProfile, filterCategory, filterLocation, router]);

  const handlePageChange = (p: number) => {
    setPage(p);
    gridRef.current?.scrollTo({ top: 0, behavior: "smooth" });
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

  const handleQrScan = async (scanned: string) => {
    const { code } = parseScannedCode(scanned);
    try {
      const data = await searchDispenseItems({ q: code, perPage: "1", categoryId: filterCategory || undefined, building: filterLocation.building || undefined, floor: filterLocation.floor || undefined, room: filterLocation.room || undefined, detail: filterLocation.detail || undefined, profileId: filterProfile || undefined });
      const found = (data.items ?? [])[0] as SearchItem | undefined;
      if (found && found.code === code) {
        handleAdd(found);
      } else {
        toast.error(`ไม่พบรหัส "${code}"`, { id: "qr-not-found" });
      }
    } catch {
      toast.error("ค้นหาไม่สำเร็จ", { id: "qr-fail" });
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
          <Button type="button" onClick={() => setScannerOpen(true)} aria-label="เพิ่มด้วย QR" className="h-11 sm:h-12 w-11 sm:w-auto px-0 sm:px-4 rounded-xl gap-2 shrink-0 justify-center">
            <QrCode className="size-5" />
            <span className="font-medium hidden sm:inline">เพิ่มด้วย QR</span>
          </Button>
          {/* Test helper, dev only. It sat beside เพิ่มด้วย QR at the same weight, so a real
              cart was one mis-tap from ten random items. NODE_ENV is inlined at build time,
              so this whole branch is dropped from the production bundle. */}
          {process.env.NODE_ENV !== "production" && (
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
          )}
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

      <Card className="flex-1 min-h-0 px-3 pt-3 pb-3 gap-3 flex flex-col relative">
        <div ref={gridRef} className="flex-1 overflow-y-auto pb-1">
        {items.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {query ? "ไม่พบพัสดุที่ค้นหา" : "พิมพ์ชื่อหรือรหัสเพื่อค้นหา"}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => {
              const inCart = getItemQty(item.id);
              const cartEntry = cartItems.find((c) => c.itemId === item.id);
              // ชำรุด/ส่งซ่อม/สูญหาย on a non-tracked item moves no qty, so it still reads
              // "เหลือ 5" here. The server refuses it (api/dispense); say so before the click
              // rather than after. Tracked items keep their per-piece rules.
              const held = !item.trackIndividually && isManualHold(item.status);
              const atMax = !item.trackIndividually && (held || inCart >= item.availableQty);
              const stockNum = item.trackIndividually ? item.subItems.length : item.availableQty;
              const outOfStock = stockNum <= 0 || held;
              // What is still addable, which is what the badge is asked. Stock already sitting
              // in the cart is spoken for: the badge used to keep saying "เหลือ 3" next to a +
              // button that had gone quietly disabled, so the number and the control disagreed.
              const addable = Math.max(0, stockNum - inCart);
              // Tracked items used to hard-code "ชิ้น", which hid the real unit (เครื่อง/ตัว/ชุด).
              // Both kinds read from issueUnit now — "ชิ้น" only shows when that IS the unit.
              const stockLabel = `${stockNum} ${item.issueUnit.name}`;
              const locText = item.location && !locActive
                ? [item.location.building, item.location.floor, item.location.room, item.location.detail].filter(Boolean).join(" / ")
                : "";
              return (
                <article
                  key={item.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                >
                  <div className="flex items-start gap-3 p-3">
                    {/* Thumbnail + floating stock badge */}
                    <Link href={`/items/${item.id}`} className="relative shrink-0">
                      <div className="size-20 sm:size-24 overflow-hidden rounded-xl bg-muted ring-1 ring-border">
                        <ItemThumb
                          src={item.imageUrl}
                          alt={item.name}
                          className="transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                      <span className={`absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ring-2 ring-card ${outOfStock ? "bg-destructive" : addable === 0 ? "bg-muted-foreground" : "bg-success"}`}>
                        {held ? STATUS_LABELS[item.status] : outOfStock ? "หมด" : addable === 0 ? "อยู่ในตะกร้าหมด" : `เหลือ ${addable}`}
                      </span>
                    </Link>

                    {/* Content */}
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-center gap-2">
                        <Badge className={`text-[11px] sm:text-xs shrink-0 max-w-[140px] truncate ${item.category.profile.color ?? ""}`}>
                          {item.category.name}
                        </Badge>
                        <span className="truncate font-mono text-xs text-muted-foreground">{item.code}</span>
                      </div>
                      <Link href={`/items/${item.id}`} className="mt-1.5 block">
                        <h3 className="line-clamp-2 text-sm font-semibold leading-snug sm:text-[15px]">{item.name}</h3>
                      </Link>
                      {locText && (
                        <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="size-3.5 shrink-0" />
                          <span className="truncate">{locText}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Footer: คงเหลือ + morph stepper */}
                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-3 py-2.5">
                    {/* Stock, then what the cart already holds of it — so the badge on the
                        thumbnail (what is still addable) is arithmetic the card shows, not a
                        third number the reader has to take on faith. */}
                    <span className="text-xs text-muted-foreground sm:text-sm">
                      คงเหลือ <span className="font-semibold text-foreground">{stockLabel}</span>
                      {inCart > 0 && <span className="ml-1.5">· ในตะกร้า <span className="font-semibold text-foreground">{inCart}</span></span>}
                    </span>

                    {inCart > 0 && cartEntry ? (
                      <div className="animate-cart-pop flex shrink-0 items-center gap-1 rounded-full bg-muted p-1 ring-1 ring-border">
                        <button
                          aria-label="ลดจำนวน"
                          className="grid size-8 place-items-center rounded-full text-foreground transition hover:bg-card active:scale-90"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (cartEntry.quantity <= 1) {
                              removeItem(item.id, cartEntry.lotId, cartEntry.subItemId);
                            } else {
                              updateItem(item.id, { quantity: cartEntry.quantity - 1 }, cartEntry.lotId, cartEntry.subItemId);
                            }
                          }}
                        >
                          <Minus className="size-4" />
                        </button>
                        <span className="min-w-[1.5rem] text-center text-sm font-bold tabular-nums">{inCart}</span>
                        <button
                          aria-label="เพิ่มจำนวน"
                          disabled={atMax}
                          className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-sm transition hover:brightness-110 active:scale-90 disabled:opacity-40 disabled:hover:brightness-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (atMax) return;
                            if (item.trackIndividually) {
                              handleAdd(item);
                            } else {
                              updateItem(item.id, { quantity: cartEntry.quantity + 1 }, cartEntry.lotId, cartEntry.subItemId);
                            }
                          }}
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-br from-primary to-primary/60 px-4 text-sm font-medium text-primary-foreground shadow-sm transition hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:hover:brightness-100"
                        onClick={(e) => { e.stopPropagation(); handleAdd(item); }}
                        disabled={outOfStock}
                      >
                        <Plus className="size-4" />
                        เพิ่ม
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        </div>

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
          <Pagination
            page={page}
            total={total}
            pageSize={PAGE_SIZE.DEFAULT}
            onChange={handlePageChange}
          />
        )}
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
