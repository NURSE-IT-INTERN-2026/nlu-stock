"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Search, Package, Plus, Minus, X, Boxes, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericInput } from "@/components/shared/numeric-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { searchDispenseItems } from "@/lib/api";
import type { ProfileOption } from "@/lib/api";
import { useDebounce } from "@/hooks/use-debounce";
import { useCategories, useLocations } from "@/hooks/use-lookup-data";
import { CategoryPicker, LocationPicker, type LocationFilter } from "@/components/items/items-filter-bar";
import type { ComponentRow } from "./types";

interface SearchResult {
  id: string;
  code: string;
  name: string;
  availableQty: number;
  issueUnit?: { id: string; name: string };
}

interface StepComponentsProps {
  components: ComponentRow[];
  assembleQty: number;
  onAssembleQtyChange: (q: number) => void;
  onAdd: (row: ComponentRow) => void;
  onRemove: (id: string) => void;
  onQtyChange: (id: string, qty: number) => void;
}

export function StepComponents({ components, assembleQty, onAssembleQtyChange, onAdd, onRemove, onQtyChange }: StepComponentsProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [location, setLocation] = useState<LocationFilter>({ building: "", floor: "", room: "", detail: "" });
  const debounced = useDebounce(query, 350);

  const { categories } = useCategories();
  const { locations } = useLocations();
  const profiles = useMemo<ProfileOption[]>(() => {
    const map = new Map<string, ProfileOption>();
    for (const c of categories) if (c.profile) map.set(c.profile.id, c.profile);
    return [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories]);

  const doSearch = useCallback(async (q: string, pId: string, cId: string, loc: LocationFilter) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await searchDispenseItems({
        q: q.trim(),
        perPage: "8",
        ...(pId ? { profileId: pId } : {}),
        ...(cId ? { categoryId: cId } : {}),
        ...(loc.building ? { building: loc.building } : {}),
        ...(loc.floor ? { floor: loc.floor } : {}),
        ...(loc.room ? { room: loc.room } : {}),
        ...(loc.detail ? { detail: loc.detail } : {}),
      });
      setResults(((data.items as unknown[]) ?? []).map((r) => {
        const it = r as Record<string, unknown>;
        return {
          id: String(it.id),
          code: String(it.code ?? ""),
          name: String(it.name ?? ""),
          availableQty: Number(it.availableQty ?? 0),
          issueUnit: it.issueUnit as { id: string; name: string } | undefined,
        };
      }));
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { doSearch(debounced, profileId, categoryId, location); }, [debounced, profileId, categoryId, location, doSearch]);

  const addedIds = new Set(components.map((c) => c.componentItemId));
  const hasFilter = profileId !== "" || categoryId !== "" || !!location.building || !!location.floor || !!location.room || !!location.detail;
  const clearFilters = () => {
    setProfileId("");
    setCategoryId("");
    setLocation({ building: "", floor: "", room: "", detail: "" });
  };
  const hasShortage = components.some((c) => c.quantity * assembleQty > c.availableQty);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 pr-6">
        <div>
          <Label htmlFor="comp-search">ค้นหาส่วนประกอบ</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">พิมพ์ชื่อหรือรหัสพัสดุที่จะประกอบเป็นชุด</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.02] px-3 py-1.5">
          <Label htmlFor="assemble-qty" className="whitespace-nowrap text-xs font-medium text-foreground">จำนวนชุด</Label>
          <NumericInput
            id="assemble-qty"
            value={assembleQty}
            onCommit={onAssembleQtyChange}
            min={1}
            className="h-8 w-16 bg-background text-center text-sm font-semibold tabular-nums"
          />
          <span className="text-xs text-muted-foreground">ชุด</span>
        </div>
      </div>

      {/* กรอง: หมวดหมู่ + สถานที่ (picker เดียวกับ filter bar หน้า items/dispense) */}
      <div className="flex flex-wrap gap-2">
        <CategoryPicker
          profiles={profiles}
          categories={categories}
          value={{ profileId, categoryId: categoryId || null }}
          onChange={(next) => { setProfileId(next.profileId); setCategoryId(next.categoryId ?? ""); }}
        />
        <LocationPicker
          value={location}
          locations={locations}
          onChange={(loc) => setLocation(loc)}
        />
        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-primary hover:text-primary hover:bg-primary/10">
            <X className="size-3.5" />
            ล้างตัวกรอง
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="comp-search"
          placeholder="เช่น ปากกาเจล, ไม้บรรทัด"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="bg-card pl-9"
        />
      </div>

      {/* Results dropdown */}
      {loading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-1.5">
          {results.map((r) => {
            const added = addedIds.has(r.id);
            const unitName = r.issueUnit?.name ?? "ชิ้น";
            return (
              <button
                key={r.id}
                type="button"
                disabled={added}
                onClick={() => {
                  onAdd({
                    componentItemId: r.id,
                    code: r.code,
                    name: r.name,
                    availableQty: r.availableQty,
                    unitName,
                    quantity: 1,
                  });
                  setQuery("");
                  setResults([]);
                }}
                className={cn(
                  "flex w-full flex-col gap-2 rounded-lg border bg-card px-3 py-2.5 text-left text-sm transition-colors sm:flex-row sm:items-center sm:gap-3",
                  added ? "cursor-not-allowed border-border opacity-50" : "border-border hover:border-primary/50 hover:bg-primary/[0.02]",
                )}
              >
                <div className="flex items-start gap-2 sm:contents">
                  <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground sm:mt-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">{r.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{r.code}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">คงเหลือ {r.availableQty} {unitName}</span>
                  </div>
                  <span className="ml-auto shrink-0 self-start sm:ml-0">
                    {added ? (
                      <Badge variant="outline" className="text-[10px]">เพิ่มแล้ว</Badge>
                    ) : (
                      <Plus className="h-4 w-4 text-primary" />
                    )}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : components.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 py-10 text-center">
          <Boxes className="h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">ยังไม่มีส่วนประกอบในชุด</p>
          <p className="text-xs text-muted-foreground/70">ค้นหาแล้วกดเพิ่มจากด้านบน</p>
        </div>
      ) : null}

      {hasShortage && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>ส่วนประกอบบางรายการมีไม่พอสำหรับ {assembleQty} ชุด — เพิ่มสต๊อกหรือลดจำนวนชุด</span>
        </div>
      )}

      {/* Added components list */}
      {components.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">ส่วนประกอบในชุด ({components.length})</div>
          <div className="space-y-1.5">
            {components.map((c) => (
              <div key={c.componentItemId} className="flex flex-col gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                {/* info + remove (mobile) */}
                <div className="flex items-start gap-2 sm:contents">
                  <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground sm:mt-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{c.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{c.code}</span>
                    </div>
                    <span className={cn("text-xs", c.quantity * assembleQty > c.availableQty ? "text-destructive" : "text-muted-foreground")}>
                      ต้องการ {c.quantity * assembleQty} · คงเหลือ {c.availableQty} {c.unitName}{c.quantity * assembleQty > c.availableQty && " · ไม่พอ"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(c.componentItemId)}
                    className="ml-auto shrink-0 self-start rounded-md p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive sm:hidden"
                    aria-label="ลบส่วนประกอบ"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* qty stepper + remove (desktop) */}
                <div className="flex items-center gap-1 sm:ml-auto">
                  <span className="mr-1 text-xs text-muted-foreground sm:hidden">จำนวนต่อชุด</span>
                  <button
                    type="button"
                    onClick={() => onQtyChange(c.componentItemId, Math.max(1, c.quantity - 1))}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <NumericInput
                    value={c.quantity}
                    onCommit={(n) => onQtyChange(c.componentItemId, n)}
                    min={1}
                    className="h-6 w-12 rounded-md border border-border bg-background text-center text-sm font-semibold tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => onQtyChange(c.componentItemId, c.quantity + 1)}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <span className="ml-1 text-xs text-muted-foreground">{c.unitName}</span>
                  <button
                    type="button"
                    onClick={() => onRemove(c.componentItemId)}
                    className="ml-1 hidden shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive sm:flex"
                    aria-label="ลบส่วนประกอบ"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
