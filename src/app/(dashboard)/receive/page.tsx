"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Trash2, Search, Package, PackagePlus, ClipboardList, Plus, ArrowDownToLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { Category, CATEGORY_COLORS } from "@/lib/constants";
import {
  searchDispenseItems,
  createReceive,
} from "@/lib/api";
import { AddItemModal } from "@/components/shared/add-item-modal";

interface SearchItem {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  issueUnit: { id: string; name: string };
  subUnit: { id: string; name: string };
  conversionFactor: number;
  trackIndividually: boolean;
  availableQty: number;
  category: { name: string; category: string };
  location: { building: string; floor: string; room: string; detail: string | null } | null;
  imageUrl?: string | null;
  images?: string[];
}

interface ReceiveRow {
  id: string;
  item: SearchItem;
  quantity: number;
  lotNumber: string;
  expiryDate: string;
  subCodes: string[];
}

export default function ReceivePage() {
  const [rows, setRows] = useState<ReceiveRow[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mobileTab, setMobileTab] = useState<"search" | "cart">("search");

  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Quick-create dialog
  const [quickOpen, setQuickOpen] = useState(false);

  const openQuickCreate = () => {
    setQuickOpen(true);
  };

  const handleItemCreated = (created: unknown) => {
    const c = created as {
      id: string; code: string; name: string; nameEn: string | null;
      issueUnit: { id: string; name: string }; subUnit: { id: string; name: string };
      conversionFactor: number; trackIndividually: boolean;
      category: { name: string; category: string };
      location: { building: string; floor: string; room: string; detail: string | null } | null;
    };
    const newItem: SearchItem = {
      id: c.id, code: c.code, name: c.name, nameEn: c.nameEn,
      issueUnit: c.issueUnit, subUnit: c.subUnit, conversionFactor: c.conversionFactor,
      trackIndividually: c.trackIndividually, availableQty: 0,
      category: c.category, location: c.location,
    };
    addItem(newItem);
    setQuickOpen(false);
  };

  const doSearch = useCallback(async (q: string) => {
    if (!q) { setSearchResults([]); setHasSearched(false); return; }
    setSearchLoading(true);
    setHasSearched(true);
    try {
      const data = await searchDispenseItems({ q, limit: "20" });
      setSearchResults((data.items ?? []) as SearchItem[]);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchChange = (val: string) => {
    setSearchQ(val);
    if (val) doSearch(val);
    else { setSearchResults([]); setHasSearched(false); }
  };

  const addItem = (item: SearchItem) => {
    setRows((prev) => {
      if (prev.some((r) => r.item.id === item.id)) {
        toast.error(`${item.code} อยู่ในรายการแล้ว`);
        return prev;
      }
      return [...prev, { id: crypto.randomUUID(), item, quantity: 1, lotNumber: "", expiryDate: "", subCodes: [] }];
    });
    setMobileTab("cart");
  };

  const updateRow = (id: string, updates: Partial<ReceiveRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));

  const removeRow = (id: string) =>
    setRows((prev) => prev.filter((r) => r.id !== id));

  const totalUnits = rows.reduce((s, r) => s + r.quantity, 0);

  const handleSubmit = async () => {
    if (rows.length === 0) { toast.error("เพิ่มพัสดุอย่างน้อย 1 รายการ"); return; }
    for (const row of rows) {
      if (row.quantity < 1) { toast.error(`จำนวนไม่ถูกต้อง: ${row.item.code}`); return; }
      const isConsumable = row.item.category.category === "CON" || row.item.category.category === "MED";
      if (isConsumable && !row.lotNumber.trim()) { toast.error(`ต้องระบุ Lot Number: ${row.item.code}`); return; }
    }
    setSubmitting(true);
    try {
      const payload = {
        items: rows.map((r) => ({
          itemId: r.item.id,
          quantity: r.quantity,
          lotNumber: (r.item.category.category === "CON" || r.item.category.category === "MED") ? r.lotNumber || null : null,
          expiryDate: r.expiryDate || null,
          subCodes: r.item.trackIndividually && r.subCodes.length > 0 ? r.subCodes : null,
        })),
        notes: notes || null,
      };
      const data = await createReceive(payload);
      toast.success(`รับเข้าสำเร็จ ${data.count} รายการ`);
      setRows([]);
      setNotes("");
      setMobileTab("search");
    } catch {
      toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Search panel ──────────────────────────────────────────────
  const SearchPanel = (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="relative mb-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="ค้นหาพัสดุ (รหัส / ชื่อ)..."
          value={searchQ}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9 text-gray-900 border-0 shadow-none rounded-none focus-visible:ring-0"
          autoFocus
        />
      </div>
      <div className="border-b shrink-0" />

      {/* Results list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {searchLoading ? (
          <div className="space-y-px">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-1 py-3">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            ))}
          </div>
        ) : !hasSearched ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Search className="h-9 w-9 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">พิมพ์รหัสหรือชื่อพัสดุเพื่อค้นหา</p>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Package className="h-9 w-9 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">ไม่พบ &ldquo;{searchQ}&rdquo; ในระบบ</p>
          </div>
        ) : (
          <div className="divide-y">
            {searchResults.map((item) => {
              const alreadyAdded = rows.some((r) => r.item.id === item.id);
              const thumb = item.images?.[0] ?? item.imageUrl ?? null;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-4 py-4 px-2",
                    alreadyAdded ? "opacity-40" : "",
                  )}
                >
                  {/* Thumbnail */}
                  <div className="h-14 w-14 rounded-lg overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                    {thumb ? (
                      <img src={thumb} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base leading-snug text-foreground">{item.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {item.code}
                      {" · "}
                      {item.category.name}
                      {" · "}
                      คงเหลือ {item.availableQty} {item.issueUnit.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={alreadyAdded}
                    aria-label={`เพิ่ม ${item.name}`}
                    onClick={() => !alreadyAdded && addItem(item)}
                    className={cn(
                      "h-10 w-10 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                      alreadyAdded
                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                        : "bg-foreground text-background hover:bg-foreground/80 cursor-pointer",
                    )}
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky "สร้างใหม่" at bottom */}
      <div className="pt-3 mt-auto shrink-0 border-t">
        <Button variant="outline" className="w-full gap-2" onClick={openQuickCreate}>
          <PackagePlus className="h-4 w-4" />
          ไม่มีพัสดุนี้ — เพิ่มใหม่
        </Button>
      </div>
    </div>
  );

  // ── Cart panel ────────────────────────────────────────────────
  const CartPanel = (
    <div className="flex flex-col h-full">
      {/* Header summary */}
      <div className="pb-3 mb-1 shrink-0 border-b">
        <p className="text-xs text-muted-foreground">
          {rows.length} รายการ · รวม {totalUnits} หน่วย
        </p>
      </div>

      {/* Items or empty state */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-8">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <ArrowDownToLine className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              เลือกพัสดุจากฝั่งซ้าย<br />เพื่อเริ่มบันทึกรับเข้า
            </p>
          </div>
        ) : (
          <div className="space-y-2 pb-2">
            {rows.map((row) => {
              const isConsumable = row.item.category.category === "CON" || row.item.category.category === "MED";
              return (
                <Card key={row.id} className="border shadow-none">
                  <CardContent className="pt-3 pb-3 space-y-3">
                    {/* Item header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm leading-snug">{row.item.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {row.item.code}
                          {" · "}
                          <Badge className={cn("text-[10px] align-middle", CATEGORY_COLORS[row.item.category.category as Category] ?? "")}>
                            {row.item.category.name}
                          </Badge>
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="ลบออก"
                        onClick={() => removeRow(row.id)}
                        className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Fields */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">จำนวน ({row.item.issueUnit.name})</Label>
                        <Input
                          type="number"
                          min={1}
                          value={row.quantity}
                          onChange={(e) => updateRow(row.id, { quantity: parseInt(e.target.value) || 0 })}
                          className="text-gray-900 h-8 text-sm"
                        />
                      </div>
                      {row.item.trackIndividually && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Sub-codes</Label>
                          <Input
                            placeholder="A001, A002"
                            value={row.subCodes.join(", ")}
                            onChange={(e) => updateRow(row.id, { subCodes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                            className="text-gray-900 h-8 text-sm"
                          />
                        </div>
                      )}
                    </div>

                    {isConsumable && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Lot Number *</Label>
                          <Input
                            placeholder="LOT-001"
                            value={row.lotNumber}
                            onChange={(e) => updateRow(row.id, { lotNumber: e.target.value })}
                            className="text-gray-900 h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">วันหมดอายุ</Label>
                          <Input
                            type="date"
                            value={row.expiryDate}
                            onChange={(e) => updateRow(row.id, { expiryDate: e.target.value })}
                            className="text-gray-900 h-8 text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {rows.length > 0 && (
              <div className="space-y-1 pt-1">
                <Label className="text-xs text-muted-foreground">หมายเหตุ</Label>
                <Textarea
                  placeholder="หมายเหตุ (optional)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="text-gray-900 text-sm"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Submit — always visible */}
      <div className="pt-3 shrink-0 border-t mt-auto">
        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={submitting || rows.length === 0}
        >
          <ArrowDownToLine className="h-4 w-4 mr-2" />
          {submitting ? "กำลังบันทึก..." : `บันทึกรับเข้า (${rows.length})`}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] md:h-[calc(100dvh-5rem)]">
      {/* Header */}
      <div className="flex items-start justify-between pt-4 pb-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold">รับเข้าพัสดุ</h1>
          <p className="text-sm text-muted-foreground">เลือกพัสดุที่มีอยู่หรือเพิ่มรายการใหม่เข้าระบบ</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold tracking-widest text-muted-foreground bg-muted/50 shrink-0 mt-0.5">
          <ArrowDownToLine className="h-3 w-3" />
          STOCK IN
        </span>
      </div>

      {/* ── Desktop: 2-column ──────────────────────────────── */}
      <div className="hidden md:grid md:grid-cols-2 md:gap-4 flex-1 min-h-0 pb-4">
        <Card className="flex flex-col overflow-hidden">
          <CardContent className="flex-1 min-h-0 overflow-hidden py-0 flex flex-col">
            {SearchPanel}
          </CardContent>
        </Card>

        <Card className="flex flex-col overflow-hidden">
          <div className="px-6 pt-4 pb-0 shrink-0">
            <p className="font-semibold text-base">รายการรับเข้า</p>
          </div>
          <CardContent className="flex-1 min-h-0 overflow-hidden py-0 flex flex-col">
            {CartPanel}
          </CardContent>
        </Card>
      </div>

      {/* ── Mobile: tabs ───────────────────────────────────── */}
      <div className="flex md:hidden flex-col flex-1 min-h-0">
        <div className="flex shrink-0 border-b bg-background">
          <button
            type="button"
            className={cn(
              "flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors",
              mobileTab === "search" ? "border-primary text-primary" : "border-transparent text-muted-foreground",
            )}
            onClick={() => setMobileTab("search")}
          >
            <Search className="h-4 w-4" /> เพิ่มพัสดุ
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors",
              mobileTab === "cart" ? "border-primary text-primary" : "border-transparent text-muted-foreground",
            )}
            onClick={() => setMobileTab("cart")}
          >
            <ClipboardList className="h-4 w-4" />
            รายการ
            {rows.length > 0 && (
              <span className="ml-0.5 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                {rows.length}
              </span>
            )}
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden p-3 flex flex-col">
          {mobileTab === "search" ? SearchPanel : CartPanel}
        </div>
      </div>

      {/* Add item modal (wizard) */}
      <AddItemModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onCreated={handleItemCreated}
        defaultCode={searchQ.trim()}
      />
    </div>
  );
}
