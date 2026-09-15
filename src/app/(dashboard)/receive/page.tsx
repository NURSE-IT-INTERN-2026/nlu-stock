"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Trash2, Search, PackagePlus, ClipboardList, Plus, ArrowDownToLine, PackageCheck, Undo2 } from "lucide-react";
import { motion } from "motion/react";
import { ItemThumb } from "@/components/shared/item-thumb";
import { cn } from "@/lib/utils";
import {
  searchDispenseItems,
  createReceive,
  getItem,
  getSubItems,
} from "@/lib/api";

// ponytail: crypto.randomUUID needs a secure context (HTTPS/localhost); mobile over
// plain http is non-secure so randomUUID is undefined — fall back to getRandomValues.
const uid = () =>
  crypto.randomUUID?.() ?? `r${crypto.getRandomValues(new Uint32Array(2)).join("-")}`;
import { AddItemModal } from "@/components/shared/add-item-modal";
import { ReturnPanel } from "@/components/receive/return-panel";
import { InUsePanel } from "@/components/receive/in-use-panel";
import { usePageHeader } from "@/components/layout/page-header-context";
import { EmptyState } from "@/components/shared/empty-state";

interface SearchItem {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  issueUnit: { id: string; name: string };
  trackIndividually: boolean;
  availableQty: number;
  category: { name: string; profile: { dispenseType: "CONSUMABLE" | "COUNT" | "ITEM"; color: string } };
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
  unitCost: string;
  subCodes: string[];
  subStart: number;
  subWidth: number;
  existingLots: { lotNumber: string; expiryDate: string | null }[];
}

// เลขล็อตอยู่รายบรรทัดคู่กับวันหมดอายุ ไม่ใช่ระดับใบ: สองอย่างนี้ประกอบกันเป็นล็อตหนึ่งล็อต
// (api/receive เทียบเป็นคู่) และ ReceiveRecord ก็ถือ lotId/batchRef รายแถวอยู่แล้ว — หน้าที่ใช้แก้
// ทีหลัง (รายงาน › เข้าคลัง) จึงแก้ทีละแถวเช่นกัน.

/** ล็อตเลขเดียวกันของพัสดุเดียวกันแต่วันหมดอายุคนละวัน. api/receive ไม่ยอมให้รวม (จะทำ FEFO เพี้ยน)
 *  และเลขที่พิมพ์เองไม่มีทางแยกอัตโนมัติแบบเลข RCV ได้ — มันจึง throw ทั้ง transaction. */
function lotClash(row: ReceiveRow): { lotNumber: string; expiryDate: string } | null {
  if (row.item.category.profile.dispenseType !== "CONSUMABLE") return null;
  const typed = row.lotNumber.trim();
  if (!typed || !row.expiryDate) return null;
  const hit = row.existingLots.find((l) => l.lotNumber === typed);
  if (!hit?.expiryDate || hit.expiryDate === row.expiryDate) return null;
  return { lotNumber: typed, expiryDate: hit.expiryDate };
}

/** เว้นเลขล็อตว่างแล้วได้ล็อตเลข RCV-YYYYMMDD หรือไม่ได้ล็อตเลย — ขึ้นกับว่าแถวนี้ "อยากมีล็อต"
 *  ไหม (api/receive `wantsLot`). ของสิ้นเปลืองส่วนใหญ่ไม่มีล็อต และไม่ควรถูกทำให้มีโดยไม่ตั้งใจ. */
function willAutoLot(row: ReceiveRow): boolean {
  return (
    row.item.category.profile.dispenseType === "CONSUMABLE" &&
    (row.existingLots.length > 0 || !!row.expiryDate)
  );
}

// Sub-codes are always "C" + padded number (C = copy). Continue numbering past existing copies.
function detectNextStart(subs: { subCode: string }[]): { start: number; width: number } {
  const parsed = subs
    .map((s) => s.subCode.match(/^C(\d+)$/i))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ num: parseInt(m[1], 10), width: m[1].length }));
  if (!parsed.length) return { start: 1, width: 2 };
  return {
    start: parsed.reduce((mx, p) => Math.max(mx, p.num), 0) + 1,
    width: parsed.reduce((mx, p) => Math.max(mx, p.width), 2),
  };
}

function genCodes(start: number, qty: number, width: number): string[] {
  return Array.from({ length: Math.max(0, qty) }, (_, i) => `C${String(start + i).padStart(width, "0")}`);
}

export default function ReceivePage() {
  return (
    <Suspense>
      <ReceiveShell />
    </Suspense>
  );
}

// รับคืนจากส่งซ่อม ย้ายไป /repairs?tab=receive — ปิดงานซ่อมเป็นเรื่องของเที่ยวซ่อม ไม่ใช่ของเข้าคลัง.
// ลิงก์เก่า (?tab=repair) ยัง redirect ให้ ดูใน ReceiveShell.
type ReceiveTab = "receive" | "in_use" | "return";

const RECEIVE_TABS = [
  { value: "receive", label: "นำเข้าคลัง", icon: ArrowDownToLine },
  { value: "in_use", label: "คืนเข้าคลัง", icon: PackageCheck },
  { value: "return", label: "รับคืนจากใบยืม", icon: Undo2 },
] as const;

function ReceiveShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: ReceiveTab =
    RECEIVE_TABS.some((t) => t.value === rawTab) ? (rawTab as ReceiveTab) : "receive";
  const initialDueChip = searchParams.get("due") === "overdue" ? "overdue" : undefined;
  // ลิงก์ "ไปหน้ารับคืน" จากเคสส่งรหัสพัสดุมาใน ?q= — แผงค้นด้วยรหัสอยู่แล้ว คนกดจึงลงตรงใบที่
  // ตัวเองกำลังดู ไม่ใช่คิวค้างคืนทั้งกองแล้วต้องหาเอง.
  const initialQuery = searchParams.get("q") ?? undefined;
  const changeTab = (value: ReceiveTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.replace(`/receive?${params.toString()}`, { scroll: false });
  };
  const { setDetail } = usePageHeader();
  const activeLabel = RECEIVE_TABS.find((t) => t.value === tab)?.label;
  useEffect(() => {
    setDetail(activeLabel ?? null);
    return () => setDetail(null);
  }, [activeLabel, setDetail]);
  // Bookmarks, the item-detail link and anything else pointing at the old tab land on the
  // page it moved to rather than silently on นำเข้าคลัง, which would look like a lost click.
  useEffect(() => {
    if (rawTab === "repair") router.replace("/repairs?tab=receive");
  }, [rawTab, router]);
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0">
        <div className="border-b -mx-4 px-4 sm:-mx-6 sm:px-6">
          <nav className="flex gap-1 -mb-px overflow-x-auto">
            {RECEIVE_TABS.map(({ value, label, icon: Icon }) => {
              const isActive = tab === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => changeTab(value as ReceiveTab)}
                  className={`relative flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                  {isActive && (
                    <motion.span
                      layoutId="receive-tab"
                      transition={{ type: "spring", stiffness: 450, damping: 35 }}
                      className="absolute -bottom-[2px] left-0 right-0 h-0.5 bg-primary"
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
      <div className="flex-1 min-h-0 pt-4">
        {tab === "receive" ? (
          <ReceiveContent />
        ) : tab === "in_use" ? (
          <InUsePanel initialQuery={initialQuery} />
        ) : (
          <ReturnPanel initialChip={initialDueChip} initialQuery={initialQuery} />
        )}
      </div>
    </div>
  );
}

function ReceiveContent() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<ReceiveRow[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mobileTab, setMobileTab] = useState<"search" | "cart">("search");

  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [suggested, setSuggested] = useState<SearchItem[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(true);

  const prefilledRef = useRef(false);

  // Quick-create dialog
  const [quickOpen, setQuickOpen] = useState(false);

  const openQuickCreate = () => {
    setQuickOpen(true);
  };

  const handleItemCreated = (created: unknown) => {
    const c = created as {
      id: string; code: string; name: string; nameEn: string | null;
      issueUnit: { id: string; name: string };
      trackIndividually: boolean;
      category: { name: string; profile: { dispenseType: "CONSUMABLE" | "COUNT" | "ITEM"; color: string } };
      location: { building: string; floor: string; room: string; detail: string | null } | null;
    };
    const newItem: SearchItem = {
      id: c.id, code: c.code, name: c.name, nameEn: c.nameEn,
      issueUnit: c.issueUnit,
      trackIndividually: c.trackIndividually, availableQty: 0,
      category: c.category, location: c.location,
    };
    addItem(newItem);
    setQuickOpen(false);
  };

  // ไม่ห่อ useCallback: doSearch ถูกเรียกจาก event handler ที่เดียว ไม่เคยอยู่ใน dep array
  // ของใคร — memo ด้วยมือจึงไม่ได้อะไร แถม React Compiler รักษามันไว้ไม่ได้ เลยข้ามการ
  // compile ทั้ง component ทิ้ง (ปล่อยให้ compiler memo เองคุ้มกว่า)
  const doSearch = async (q: string) => {
    if (!q) { setSearchResults([]); setHasSearched(false); return; }
    setSearchLoading(true);
    setHasSearched(true);
    try {
      const data = await searchDispenseItems({ q, perPage: "20" });
      setSearchResults((data.items ?? []) as SearchItem[]);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearchQ(val);
    if (val) doSearch(val);
    else { setSearchResults([]); setHasSearched(false); }
  };

  const addItem = (item: SearchItem) => {
    setRows((prev) => {
      if (prev.some((r) => r.item.id === item.id)) {
        toast.error(`${item.name} อยู่ในรายการแล้ว`);
        return prev;
      }
      return [...prev, { id: uid(), item, quantity: 1, lotNumber: "", expiryDate: "", unitCost: "", subCodes: [], subStart: 1, subWidth: 2, existingLots: [] }];
    });
    setMobileTab("cart");
    // Tracked items: prefill next sub-code number from existing copies.
    if (item.trackIndividually) {
      getSubItems(item.id)
        .then((subs) => {
          const { start, width } = detectNextStart(subs as { subCode: string }[]);
          setRows((prev) => prev.map((r) => r.item.id === item.id ? { ...r, subStart: start, subWidth: width } : r));
        })
        .catch(() => {});
    }
    // Consumables: load existing lots for the inline duplicate/expiry warning.
    if (item.category.profile.dispenseType === "CONSUMABLE") {
      getItem(item.id)
        .then((data) => {
          const lots = ((data as { lots?: { lotNumber: string; expiryDate: string | null }[] }).lots ?? [])
            .map((l) => ({ lotNumber: l.lotNumber, expiryDate: l.expiryDate ? String(l.expiryDate).slice(0, 10) : null }));
          setRows((prev) => prev.map((r) => r.item.id === item.id ? { ...r, existingLots: lots } : r));
        })
        .catch(() => {});
    }
  };

  // Pre-fill from ?item= (e.g. "รับเข้า" button on item detail).
  useEffect(() => {
    const itemId = searchParams.get("item");
    if (!itemId || prefilledRef.current) return;
    prefilledRef.current = true;
    getItem(itemId)
      .then((data) => {
        addItem(data as SearchItem);
        setMobileTab("cart");
      })
      .catch(() => toast.error("ไม่พบพัสดุที่เลือก"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Load first items so the list isn't empty before the user searches.
  useEffect(() => {
    let active = true;
    setSuggestedLoading(true);
    searchDispenseItems({ perPage: "15" })
      .then((data) => {
        if (!active) return;
        setSuggested((data.items ?? []) as SearchItem[]);
      })
      .catch(() => { if (active) setSuggested([]); })
      .finally(() => { if (active) setSuggestedLoading(false); });
    return () => { active = false; };
  }, []);

  const updateRow = (id: string, updates: Partial<ReceiveRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));

  const removeRow = (id: string) =>
    setRows((prev) => prev.filter((r) => r.id !== id));

  const totalUnits = rows.reduce((s, r) => s + r.quantity, 0);

  const handleSubmit = async () => {
    if (rows.length === 0) { toast.error("เพิ่มพัสดุอย่างน้อย 1 รายการ"); return; }
    for (const row of rows) {
      if (row.quantity < 1) { toast.error(`จำนวนไม่ถูกต้อง: ${row.item.name}`); return; }
      // A typed lot number takes api/receive's non-auto path, which throws on an expiry clash
      // and rolls back the WHOLE receipt — one bad row costs every other row on the form.
      const clash = lotClash(row);
      if (clash) {
        toast.error(`ล็อต "${clash.lotNumber}" ของ ${row.item.name} มีอยู่แล้ว วันหมดอายุ ${clash.expiryDate} — แก้เลขล็อตหรือวันหมดอายุให้ตรงกัน`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const payload = {
        items: rows.map((r) => ({
          itemId: r.item.id,
          quantity: r.quantity,
          lotNumber: r.lotNumber.trim() || null,
          expiryDate: r.expiryDate || null,
          unitCost: r.unitCost ? Number(r.unitCost) : null,
          subCodes: r.item.trackIndividually ? genCodes(r.subStart, r.quantity, r.subWidth) : null,
        })),
        notes: notes || null,
      };
      const data = await createReceive(payload);
      toast.success(`รับเข้าสำเร็จ ${data.count} รายการ`);
      setRows([]);
      setNotes("");
      setMobileTab("search");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setSubmitting(false);
    }
  };

  const ListSkeleton = (
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
  );

  const renderItemRow = (item: SearchItem) => {
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
        <div className="h-14 w-14 rounded-lg overflow-hidden shrink-0 bg-muted">
          <ItemThumb src={thumb} alt={item.name} />
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
  };

  // ── Search panel ──────────────────────────────────────────────
  const SearchPanel = (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="relative mb-3 shrink-0">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="ค้นหาพัสดุ (รหัส / ชื่อ)..."
          value={searchQ}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="h-11 pl-11 text-base text-foreground bg-background border-input focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          autoFocus
        />
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {searchLoading ? (
          ListSkeleton
        ) : !hasSearched ? (
          <>
            {suggestedLoading ? (
              ListSkeleton
            ) : suggested.length === 0 ? (
              <EmptyState title="ยังไม่มีพัสดุในระบบ" description="เพิ่มพัสดุใหม่เพื่อเริ่มรับเข้า" />
            ) : (
              <div className="divide-y">{suggested.map(renderItemRow)}</div>
            )}
          </>
        ) : searchResults.length === 0 ? (
          <EmptyState title={`ไม่พบ “${searchQ}” ในระบบ`} description="ลองเปลี่ยนคำค้น หรือเพิ่มพัสดุใหม่" />
        ) : (
          <div className="divide-y">{searchResults.map(renderItemRow)}</div>
        )}
      </div>

      {/* Sticky "สร้างใหม่" at bottom */}
      <div className="pt-3 mt-auto shrink-0 border-t">
        <Button variant="outline" className="w-full gap-2 h-12 text-base" onClick={openQuickCreate}>
          <PackagePlus className="h-5 w-5" />
          ไม่มีพัสดุนี้ — เพิ่มใหม่
        </Button>
      </div>
    </div>
  );

  // ── Cart panel ────────────────────────────────────────────────
  const CartPanel = (
    <div className="flex flex-col h-full">
      {/* Header summary — ยอดรวมขึ้นไปอยู่บรรทัดหัวการ์ดบนจอใหญ่ (ที่นั่นว่างอยู่แล้ว)
          จอเล็กไม่มีหัวการ์ด ยอดรวมจึงยังอยู่ที่เดิม */}
      <div className="pb-3 mb-1 shrink-0 border-b md:hidden">
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
              เลือกพัสดุจากฝั่งซ้ายเพื่อเริ่ม
            </p>
          </div>
        ) : (
          <div className="space-y-2 pb-2">
            {rows.map((row) => {
              const isConsumable = row.item.category.profile.dispenseType === "CONSUMABLE";
              const clash = lotClash(row);
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
                          <Badge className={cn("text-[10px] align-middle", row.item.category.profile.color ?? "")}>
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
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">จำนวน ({row.item.issueUnit.name})</Label>
                      <Input
                        type="number"
                        min={1}
                        value={row.quantity}
                        onChange={(e) => updateRow(row.id, { quantity: parseInt(e.target.value) || 0 })}
                        className="text-foreground h-8 text-sm"
                      />
                      {row.item.trackIndividually && (
                        <p className="text-[11px] text-muted-foreground font-mono break-all">
                          จะสร้าง: {genCodes(row.subStart, Math.max(1, row.quantity), row.subWidth).join(", ")}
                        </p>
                      )}
                    </div>

                    {/* เลขล็อต/ชื่องวดอยู่เหนือคู่ล่าง เพราะมันจับคู่กับวันหมดอายุ: สองช่องนี้ตัดสิน
                        ร่วมกันว่าแถวนี้ลงล็อตไหน (ของสิ้นเปลือง) หรือได้แค่ป้ายงวด (ของอื่น) */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">เลขล็อต / ชื่องวด</Label>
                      <Input
                        placeholder={willAutoLot(row) ? "เว้นว่าง = ตั้งเลขจากวันที่รับเข้า" : "เว้นว่าง = ไม่แยกล็อต"}
                        value={row.lotNumber}
                        onChange={(e) => updateRow(row.id, { lotNumber: e.target.value })}
                        aria-invalid={!!clash}
                        className="text-foreground h-8 text-sm"
                      />
                      {clash && (
                        <p role="alert" className="text-[11px] text-destructive">
                          ล็อตนี้มีอยู่แล้ว วันหมดอายุ {clash.expiryDate} — แก้เลขล็อตหรือวันหมดอายุให้ตรงกัน
                        </p>
                      )}
                    </div>

                    {/* ราคา/หน่วย ถามทุกประเภท — เดิมถามเฉพาะสิ้นเปลือง ครุภัณฑ์เลยไม่มีราคาให้
                        มูลค่าคงคลัง/ค่าใช้จ่ายรายปีอ่านเลย (3 จาก 918 รายการเท่านั้นที่มีราคา).
                        วันหมดอายุยังเป็นของสิ้นเปลืองอย่างเดียว. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {isConsumable && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">วันหมดอายุ</Label>
                          <DatePicker
                            value={row.expiryDate}
                            onChange={(v) => updateRow(row.id, { expiryDate: v })}
                            placeholder="ไม่ระบุ"
                            className="h-8"
                          />
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          ราคา/หน่วย ({row.item.issueUnit.name})
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          placeholder="-"
                          value={row.unitCost}
                          onChange={(e) => updateRow(row.id, { unitCost: e.target.value })}
                          className="text-foreground h-8 text-sm"
                        />
                      </div>
                    </div>
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
                  className="text-foreground text-sm"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Submit — always visible */}
      <div className="pt-3 shrink-0 border-t mt-auto">
        <Button
          className="w-full h-12 text-base"
          onClick={handleSubmit}
          disabled={submitting || rows.length === 0}
        >
          <ArrowDownToLine className="h-5 w-5 mr-2" />
          {submitting ? "กำลังบันทึก..." : `บันทึกรับเข้า (${rows.length})`}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Desktop: 2-column ──────────────────────────────── */}
      <div className="hidden md:grid md:grid-cols-2 md:grid-rows-1 md:gap-4 flex-1 min-h-0 pb-4">
        <Card className="flex flex-col overflow-hidden">
          <CardContent className="flex-1 min-h-0 overflow-hidden py-0 flex flex-col">
            {SearchPanel}
          </CardContent>
        </Card>

        <Card className="flex flex-col overflow-hidden">
          <div className="px-6 pt-4 pb-0 shrink-0 flex items-baseline justify-between gap-2">
            <p className="font-semibold text-base">รายการรับเข้า</p>
            <p className="text-xs text-muted-foreground">
              {rows.length} รายการ · รวม {totalUnits} หน่วย
            </p>
          </div>
          <CardContent className="flex-1 min-h-0 overflow-hidden py-0 flex flex-col">
            {CartPanel}
          </CardContent>
        </Card>
      </div>

      {/* ── Mobile: tabs inside card ──────────────────────── */}
      <div className="flex md:hidden flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0 overflow-hidden p-3 flex flex-col">
          <Card className="flex flex-col overflow-hidden flex-1 min-h-0 pt-0 pb-0 gap-0">
            <div className="flex shrink-0 border-b">
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
            <CardContent className="flex-1 min-h-0 overflow-hidden py-3 flex flex-col">
              {mobileTab === "search" ? SearchPanel : CartPanel}
            </CardContent>
          </Card>
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
