"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight,
  ChevronDown, ChevronRight as ExpandIcon, QrCode, Lock, Unlock, Info, Sparkles, Copy,
  Check, Package, Ruler, Warehouse, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { SubCodesManager } from "./sub-codes-manager";
import { QrPrintDialog, type QrPrintItem } from "@/components/shared/qr-print-dialog";
import { FileUpload } from "@/components/shared/file-upload";
import { Category, CATEGORY_LABELS, locationLabel, STATUS_PILLS, STATUS_LABELS } from "@/lib/constants";
import { getSettingsItems, getUnits, deleteSettingsItem, saveSettingsItem } from "@/lib/api";
import { AddItemModal } from "@/components/shared/add-item-modal";
import type { CategoryOption, LocationOption, UnitOption } from "@/lib/api";
import { useCategories, useLocations } from "@/hooks/use-lookup-data";
import { usePagination } from "@/hooks/use-pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


interface ItemRecord {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  categoryId: string;
  category: CategoryOption;
  trackIndividually: boolean;
  status: string;
  issueUnitId: string;
  issueUnit: UnitOption;
  subUnitId: string;
  subUnit: UnitOption;
  conversionFactor: number;
  minThreshold: number;
  locationId: string | null;
  location: LocationOption | null;
  imageUrl: string | null;
  description: string | null;
  isActive: boolean;
  totalQty: number;
  availableQty: number;
  _count: { subItems: number; dispenseRecords: number; receiveRecords: number };
  model: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  vendorCompany: string | null;
  vendorContact: string | null;
  vendorPhone: string | null;
  warrantyMonths: number;
  maintenanceCycleMonths: number;
  storageRequirements: string | null;
}

const defaultForm = {
  code: "", name: "", nameEn: "", categoryId: "", trackIndividually: false,
  issueUnitId: "", subUnitId: "", conversionFactor: 1, minThreshold: 0,
  locationId: "", description: "", isActive: true,
  imageUrl: null as string | null,
  model: "", purchaseDate: "", purchasePrice: "",
  vendorCompany: "", vendorContact: "", vendorPhone: "",
  warrantyMonths: 0, maintenanceCycleMonths: 12,
  storageRequirements: "",
};

const STATUS_CHIPS = [
  { value: "AVAILABLE", label: "มีอยู่", color: "bg-success/15 text-success hover:bg-success/25 border-success/30" },
  { value: "CHECKED_OUT", label: "ถูกยืม", color: "bg-info-500/15 text-info-500 hover:bg-info-500/25 border-info-500/30" },
  { value: "DAMAGED", label: "ชำรุด", color: "bg-destructive/15 text-destructive hover:bg-destructive/25 border-destructive/30" },
  { value: "UNDER_REPAIR", label: "ซ่อมอยู่", color: "bg-warning/15 text-warning-foreground hover:bg-warning/25 border-warning/30" },
  { value: "LOST", label: "สูญหาย", color: "bg-purple-500/15 text-purple-500 hover:bg-purple-500/25 border-purple-500/30" },
  { value: "DISPOSED", label: "จำหน่ายแล้ว", color: "bg-muted text-muted-foreground hover:bg-muted/80 border-border" },
  { value: "INACTIVE", label: "ปิดใช้งาน", color: "bg-muted text-muted-foreground hover:bg-muted/80 border-border" },
] as const;

// Local labels for this tab (includes INACTIVE)
const STATUS_THAI: Record<string, string> = {
  ...STATUS_LABELS,
  INACTIVE: "ปิดใช้งาน",
};

function StockBar({ available, total, threshold }: { available: number; total: number; threshold: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">-</span>;
  const pct = Math.round((available / total) * 100);
  const barColor = available < threshold ? "bg-destructive" : pct < 50 ? "bg-warning" : "bg-success";
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs tabular-nums whitespace-nowrap ${available < threshold ? "text-destructive font-medium" : "text-muted-foreground"}`}>
        {available}/{total}
      </span>
    </div>
  );
}

export function ItemsMasterTab() {
  const [items, setItems] = useState<ItemRecord[]>([]);
  const { categories } = useCategories();
  const { locations } = useLocations();
  const [units, setUnits] = useState<UnitOption[]>([]);
  const { page, setPage, perPage, total, setTotal, totalPages } = usePagination(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editing, setEditing] = useState<ItemRecord | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printOpen, setPrintOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ItemRecord | null>(null);

  // ── Code builder state ───────────────────────────────────────
  // codeGroup = NNN for KRU/ELE group, or หมวด NNN for BOOK/TOY
  const [codeGroup, setCodeGroup] = useState("");
  const [codeSubcode, setCodeSubcode] = useState("");
  const [codeSet, setCodeSet] = useState("");  // e.g. "S10"
  const [codeLocked, setCodeLocked] = useState(true); // true = auto, false = manual
  const [suggestedCode, setSuggestedCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [existingItems, setExistingItems] = useState<{ code: string; name: string }[]>([]);
  const [codeGroups, setCodeGroups] = useState<{ code: string; name: string }[]>([]);
  const suggestDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nameDuplicates, setNameDuplicates] = useState<{ code: string; name: string }[]>([]);
  const nameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dialogTab, setDialogTab] = useState("basic");
  const [copiedCode, setCopiedCode] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {
      page: String(page),
      perPage: String(perPage),
    };
    if (search) params.search = search;
    if (filterCategory) params.categoryId = filterCategory;
    if (filterStatus === "INACTIVE") {
      params.active = "false";
    } else if (filterStatus) {
      params.status = filterStatus;
    }

    const data = await getSettingsItems(params);
    setItems((data.items || []) as ItemRecord[]);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, perPage, search, filterCategory, filterStatus]);

  useEffect(() => { getUnits().then(setUnits); }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { setSelectedIds(new Set()); }, [page, search, filterCategory, filterStatus]);

  // ── Keyboard shortcuts: / = focus search, Escape = clear search ──
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (dialogOpen) return;
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape" && search) {
        setSearch("");
        setPage(1);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dialogOpen, search]);

  // ── Suggest code whenever relevant fields change ─────────────
  const selectedCategory = categories.find((c) => c.id === form.categoryId);
  const prefix = selectedCategory?.category ?? "";
  const FLAT = ["DUR", "CON", "MED", "KIT"];
  const INDIVIDUAL = ["KRU", "ELE"];
  const COPY_TRACK = ["BOOK", "TOY"];

  const fetchSuggestedCode = useCallback(async () => {
    if (!prefix || editing) return; // don't auto-suggest when editing
    const params = new URLSearchParams({ prefix });
    if (INDIVIDUAL.includes(prefix) && codeGroup) params.set("code", codeGroup);
    if (COPY_TRACK.includes(prefix)) {
      if (codeGroup) params.set("code", codeGroup);
      if (codeSubcode) params.set("subcode", codeSubcode);
      if (codeSet) params.set("set", codeSet);
    }
    setCodeLoading(true);
    try {
      const res = await fetch(`/api/items/suggest-code?${params}`);
      const data = await res.json();
      setSuggestedCode(data.suggestedCode ?? "");
      setExistingItems(data.existingItems ?? []);
      if (data.groups) setCodeGroups(data.groups);
      if (codeLocked) setForm((f) => ({ ...f, code: data.suggestedCode ?? f.code }));
    } catch {
      // ignore
    } finally {
      setCodeLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix, codeGroup, codeSubcode, codeSet, codeLocked, editing]);

  useEffect(() => {
    if (!prefix || editing) return;
    if (suggestDebounce.current) clearTimeout(suggestDebounce.current);
    suggestDebounce.current = setTimeout(fetchSuggestedCode, 300);
    return () => { if (suggestDebounce.current) clearTimeout(suggestDebounce.current); };
  }, [prefix, codeGroup, codeSubcode, codeSet, fetchSuggestedCode, editing]);

  // ── Name duplicate check for FLAT categories ──────────────
  useEffect(() => {
    if (!FLAT.includes(prefix) || editing || !form.name.trim()) {
      setNameDuplicates([]);
      return;
    }
    if (nameDebounce.current) clearTimeout(nameDebounce.current);
    nameDebounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/settings/items?search=${encodeURIComponent(form.name.trim())}&categoryId=${form.categoryId}&perPage=5`);
        const data = await res.json();
        const found = ((data.items ?? []) as { code: string; name: string }[])
          .filter((i) => i.code !== form.code);
        setNameDuplicates(found);
      } catch { /* ignore */ }
    }, 400);
    return () => { if (nameDebounce.current) clearTimeout(nameDebounce.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name, form.categoryId, prefix, editing]);

  // When dialog opens, also load KRU/ELE groups
  useEffect(() => {
    if (!dialogOpen || editing || !INDIVIDUAL.includes(prefix)) return;
    fetch(`/api/items/suggest-code?prefix=${prefix}`)
      .then((r) => r.json())
      .then((d) => { if (d.groups) setCodeGroups(d.groups); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, prefix, editing]);

  function openCreate() {
    setAddItemOpen(true);
  }

  function openEdit(item: ItemRecord) {
    setEditing(item);
    setForm({
      code: item.code,
      name: item.name,
      nameEn: item.nameEn || "",
      categoryId: item.categoryId,
      trackIndividually: item.trackIndividually,
      issueUnitId: item.issueUnitId,
      subUnitId: item.subUnitId,
      conversionFactor: item.conversionFactor,
      minThreshold: item.minThreshold,
      locationId: item.locationId || "",
      description: item.description || "",
      isActive: item.isActive,
      imageUrl: item.imageUrl,
      model: item.model || "",
      purchaseDate: item.purchaseDate ? item.purchaseDate.split("T")[0] : "",
      purchasePrice: item.purchasePrice != null ? String(item.purchasePrice) : "",
      vendorCompany: item.vendorCompany || "",
      vendorContact: item.vendorContact || "",
      vendorPhone: item.vendorPhone || "",
      warrantyMonths: item.warrantyMonths ?? 0,
      maintenanceCycleMonths: item.maintenanceCycleMonths,
      storageRequirements: item.storageRequirements || "",
    });
    setDialogTab("basic");
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      ...form,
      nameEn: form.nameEn || null,
      locationId: form.locationId || null,
      description: form.description || null,
      imageUrl: form.imageUrl || null,
      conversionFactor: Number(form.conversionFactor),
      minThreshold: Number(form.minThreshold),
      maintenanceCycleMonths: Number(form.maintenanceCycleMonths),
      warrantyMonths: Number(form.warrantyMonths),
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
      purchaseDate: form.purchaseDate || null,
      model: form.model || null,
      vendorCompany: form.vendorCompany || null,
      vendorContact: form.vendorContact || null,
      vendorPhone: form.vendorPhone || null,
      storageRequirements: form.storageRequirements || null,
    };

    try {
      await saveSettingsItem(payload, editing?.id);
      toast.success(editing ? "แก้ไขรายการสำเร็จ" : "เพิ่มรายการสำเร็จ");
      setDialogOpen(false);
      fetchItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
    setSaving(false);
  }

  async function handleDelete(item: ItemRecord) {
    setDeleteTarget(item);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteSettingsItem(deleteTarget.id);
      toast.success("ลบรายการสำเร็จ");
      fetchItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
    setDeleteTarget(null);
  }

  const isFixedAsset = selectedCategory?.category === "KRU" || selectedCategory?.category === "ELE";
  const isConsumable = selectedCategory?.category === "CON" || selectedCategory?.category === "MED";
  const isBook = selectedCategory?.category === "BOOK";
  const trackForced = selectedCategory ? (
    ["KRU", "ELE", "BOOK", "TOY"].includes(selectedCategory.category) ? true
    : ["CON", "MED"].includes(selectedCategory.category) ? false
    : undefined
  ) : undefined;

  const DIALOG_TABS = [
    { value: "basic", label: "ข้อมูลพื้นฐาน", icon: Package },
    { value: "units", label: "หน่วย", icon: Ruler },
    { value: "stock", label: "สต็อก", icon: Warehouse },
    { value: "more", label: "เพิ่มเติม", icon: FileText },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Filter toolbar — utility zone, visually recessed */}
      <div className="rounded-xl bg-card border border-border/40 p-3 space-y-2.5 shadow-sm">
        {/* Row 1: search + dropdowns + actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหารหัส ชื่อพัสดุ... ( / )"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 h-9 bg-card"
              ref={searchInputRef}
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
          <Select value={filterCategory || "__all__"} onValueChange={(v) => { setFilterCategory(!v || v === "__all__" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-[160px] h-9 bg-card">
              <SelectValue placeholder="ทุกหมวดหมู่">
                {(value: string | null) => {
                  if (!value || value === "__all__") return "ทุกหมวดหมู่";
                  const cat = categories.find((c) => c.id === value);
                  return cat?.name ?? "ทุกหมวดหมู่";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">ทุกหมวดหมู่</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            {selectedIds.size > 0 && (
              <Button size="sm" variant="outline" onClick={() => setPrintOpen(true)}>
                <QrCode className="h-4 w-4 mr-1" />พิมพ์ QR ({selectedIds.size})
              </Button>
            )}
            <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />เพิ่มรายการ</Button>
          </div>
          </div>
        </div>

        {/* Row 2: status chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">สถานะ:</span>
          <button
            type="button"
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              !filterStatus
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/50 text-foreground/70 border-border hover:bg-muted"
            }`}
            onClick={() => { setFilterStatus(""); setPage(1); }}
          >
            ทั้งหมด
          </button>
          {STATUS_CHIPS.map((chip) => {
            const active = filterStatus === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  active ? chip.color : "bg-muted/50 text-foreground/70 border-border hover:bg-muted"
                }`}
                onClick={() => { setFilterStatus(active ? "" : chip.value); setPage(1); }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>
      {/* Table — hero zone, most visual weight */}
      <div className="rounded-2xl border overflow-hidden bg-card shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-300px)]">
        <Table>
          <TableHeader>
            <TableRow className="sticky top-0 z-10 bg-card border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              <TableHead className="w-[48px] pl-4">
                <input
                  type="checkbox"
                  checked={items.length > 0 && items.every((i) => selectedIds.has(i.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(items.map((i) => i.id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                  className="rounded"
                />
              </TableHead>
              <TableHead>รหัส</TableHead>
              <TableHead>ชื่อพัสดุ</TableHead>
              <TableHead>หมวดหมู่</TableHead>
              <TableHead className="text-right">คงเหลือ / ทั้งหมด</TableHead>
              <TableHead>หน่วย</TableHead>
              <TableHead>สถานที่</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="w-[100px]">จัดการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-12">
                <div className="flex flex-col items-center gap-3 text-center">
                  <Package className="h-8 w-8 text-muted-foreground/40" />
                  <div>
                    <p className="text-sm font-medium text-foreground">ไม่พบรายการพัสดุ</p>
                    <p className="text-xs text-muted-foreground mt-0.5">ลองปรับตัวกรองหรือเพิ่มรายการใหม่</p>
                  </div>
                </div>
              </TableCell></TableRow>
            ) : items.map((item) => (
              <React.Fragment key={item.id}>
                <TableRow
                  className={`group ${!item.isActive ? "opacity-50" : ""} ${item.trackIndividually && item._count.subItems > 1 ? "cursor-pointer hover:bg-muted/40" : ""}`}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest("input[type='checkbox'], button, a")) {
                      if (item.trackIndividually && item._count.subItems > 1) {
                        setExpandedRow(expandedRow === item.id ? null : item.id);
                      }
                    }
                  }}
                >
                  <TableCell className="pl-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        e.target.checked ? next.add(item.id) : next.delete(item.id);
                        setSelectedIds(next);
                      }}
                      className="rounded"
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    <div className="flex items-center gap-1">
                      {item.trackIndividually && item._count.subItems > 1 && (
                        <button type="button" aria-label="ดู sub-codes" onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)} className="p-0.5 hover:bg-muted rounded">
                          {expandedRow === item.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ExpandIcon className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      {item.code}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="font-medium">{item.name}</span>
                      {item.nameEn && <span className="text-muted-foreground ml-1">({item.nameEn})</span>}
                    </div>
                    {item.trackIndividually && item._count.subItems > 1 && <Badge variant="secondary" className="text-xs mt-0.5">ติดตาม ({item._count.subItems})</Badge>}
                  </TableCell>
                  <TableCell><Badge variant="outline">{CATEGORY_LABELS[item.category.category as Category] || item.category.name}</Badge></TableCell>
                  <TableCell>
                    <StockBar available={item.availableQty} total={item.totalQty} threshold={item.minThreshold} />
                  </TableCell>
                  <TableCell className="text-sm">{item.issueUnit.name}</TableCell>
                  <TableCell className="text-sm">{item.location ? locationLabel(item.location) : "-"}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_PILLS[item.status] || "bg-muted text-muted-foreground border-border"}`}>
                      {STATUS_THAI[item.status] ?? item.status.replace(/_/g, " ")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <div className="flex gap-1">
                        <Tooltip>
                          <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => openEdit(item)} aria-label="แก้ไข" />}>
                            <Pencil className="h-3.5 w-3.5" />
                          </TooltipTrigger>
                          <TooltipContent>แก้ไข</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => handleDelete(item)} aria-label="ลบ" />}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </TooltipTrigger>
                          <TooltipContent>ลบ</TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
                {expandedRow === item.id && item.trackIndividually && item._count.subItems > 1 && (
                  <TableRow key={`${item.id}-expand`}>
                    <TableCell colSpan={9} className="bg-muted/30 p-4">
                      <SubCodesManager itemId={item.id} itemCode={item.code} />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
        </div>

        {/* Pagination — minimal, quiet */}
        <div className="flex items-center border-t border-border/50 bg-muted/20 px-3 py-1.5">
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(1)} className="h-6 w-6 p-0 text-xs text-muted-foreground">
              &laquo;
            </Button>
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-6 w-6 p-0">
              <ChevronLeft className="h-3 w-3 text-muted-foreground" />
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
                    onClick={() => setPage(p as number)}
                    className="h-6 w-6 p-0 text-xs"
                  >
                    {p}
                  </Button>
                )
              )}
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="h-6 w-6 p-0">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="h-6 w-6 p-0 text-xs">
              &raquo;
            </Button>
          </div>
          <div className="flex-1" />
          <span className="text-sm text-muted-foreground tabular-nums">{total} รายการ</span>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[640px] sm:max-w-[640px] gap-0 p-0 overflow-hidden">
          <DialogHeader className="flex-row items-center gap-3 border-b border-border bg-card px-6 py-4 pr-14">
            {/* Group 1: icon + title + code badge — flex-none */}
            <div className="flex items-center gap-3 shrink-0 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {editing ? <Pencil className="h-4 w-4" /> : <Package className="h-4 w-4" />}
              </div>
              <DialogTitle className="text-base font-semibold text-foreground shrink-0">
                {editing ? "แก้ไขรายการ" : "เพิ่มรายการใหม่"}
              </DialogTitle>
              <div className="flex items-center gap-1 rounded-full border border-orange-300/50 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800 pl-2.5 pr-1 py-1 shrink-0">
                <Sparkles className="h-3 w-3 text-orange-400 shrink-0" />
                <span className="font-mono text-xs font-semibold text-orange-600 dark:text-orange-300 tabular-nums ml-1">
                  {codeLoading ? "..." : (form.code || suggestedCode || "—")}
                </span>
                {!editing && (
                  <button type="button"
                    onClick={() => { setCodeLocked(!codeLocked); if (codeLocked && suggestedCode) setForm((f) => ({ ...f, code: suggestedCode })); }}
                    className="h-6 w-6 ml-0.5 flex items-center justify-center rounded-full text-orange-400 hover:text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
                    aria-label={codeLocked ? "โหมดอัตโนมัติ" : "โหมดแก้ไขเอง"}
                  >
                    {codeLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  </button>
                )}
                <button type="button"
                  onClick={() => { const code = form.code || suggestedCode; if (code) { navigator.clipboard.writeText(code); setCopiedCode(true); setTimeout(() => setCopiedCode(false), 1500); } }}
                  className="h-6 w-6 flex items-center justify-center rounded-full text-orange-400 hover:text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
                  aria-label="คัดลอกรหัส"
                >
                  {copiedCode ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
            {/* Spacer */}
            <div className="flex-1" />
            {editing && (
              <label className={`flex items-center gap-2 cursor-pointer select-none rounded-full border px-3 py-1.5 transition-colors ${
                form.isActive
                  ? "border-success/30 bg-success/8 text-success"
                  : "border-border bg-muted/60 text-muted-foreground"
              }`}>
                <span className="text-xs font-medium">
                  {form.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                </span>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                  aria-label="เปลี่ยนสถานะการใช้งาน"
                  className={form.isActive ? "data-checked:!bg-success" : ""}
                />
              </label>
            )}
            <DialogDescription className="sr-only">
              {editing ? "แก้ไขข้อมูลพัสดุ" : "ระบบจะสร้างรหัสให้อัตโนมัติตามหมวดหมู่"}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={dialogTab} onValueChange={setDialogTab} className="flex flex-col">
            <TabsList className="mx-6 mt-4 grid grid-cols-4 h-9 bg-muted/60 shrink-0">
              {DIALOG_TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <TabsTrigger key={t.value} value={t.value} className="text-xs gap-1.5 data-active:!bg-primary/10 data-active:!text-primary data-active:!shadow-none">
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <div className="px-6 py-5 min-h-[300px] max-h-[55vh] overflow-y-auto bg-secondary/40">
              {/* ── Tab 1: ข้อมูลพื้นฐาน ── */}
              <TabsContent value="basic" className="mt-0 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground">หมวดหมู่ <span className="text-destructive">*</span></Label>

              {form.categoryId && (
                <div className="space-y-3">
                  {existingItems.length > 0 && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-300">
                      <Info className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="text-xs">
                        <p className="font-medium">พบ {existingItems.length} รายการที่ match อยู่แล้ว</p>
                        {existingItems.slice(0, 3).map((i) => <p key={i.code} className="font-mono">{i.code} — {i.name}</p>)}
                        {existingItems.length > 3 && <p>และอีก {existingItems.length - 3} รายการ</p>}
                      </div>
                    </div>
                  )}
                  {!codeLocked && (
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">รหัสพัสดุ (แก้ไขเอง)</Label>
                      <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="text-gray-900 bg-muted/50 border-transparent shadow-none font-mono" placeholder="NLU-..." />
                    </div>
                  )}
                  {INDIVIDUAL.includes(prefix) && (
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">
                        ชื่ออุปกรณ์ (NNN) <span className="text-muted-foreground/60">— NNN ที่สองจะเป็นลำดับ copy อัตโนมัติ</span>
                      </Label>
                      <Select value={codeGroup} onValueChange={(v) => setCodeGroup(v === "__new__" ? "" : v)}>
                        <SelectTrigger className="bg-muted/50 border-transparent shadow-none">
                          <span className={codeGroup ? "text-gray-900" : "text-muted-foreground"}>
                            {codeGroup ? `${codeGroup} — ${codeGroups.find((g) => g.code === codeGroup)?.name ?? "ใหม่"}` : "เลือกชื่ออุปกรณ์ หรือสร้างใหม่"}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__new__">+ เพิ่มอุปกรณ์ชื่อใหม่</SelectItem>
                          {codeGroups.map((g) => <SelectItem key={g.code} value={g.code}>{g.code} — {g.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {COPY_TRACK.includes(prefix) && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">หมวด (CODE)</Label>
                        <Input placeholder="001" maxLength={3} value={codeGroup}
                          onChange={(e) => setCodeGroup(e.target.value.replace(/\D/g, ""))}
                          onBlur={(e) => { if (e.target.value) setCodeGroup(e.target.value.padStart(3, "0")); }}
                          className="text-gray-900 bg-muted/50 border-transparent shadow-none font-mono" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">รายการ (SUBCODE)</Label>
                        <Input placeholder="auto" maxLength={3} value={codeSubcode}
                          onChange={(e) => setCodeSubcode(e.target.value.replace(/\D/g, ""))}
                          onBlur={(e) => { if (e.target.value) setCodeSubcode(e.target.value.padStart(3, "0")); }}
                          className="text-gray-900 bg-muted/50 border-transparent shadow-none font-mono" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">จำนวนใน Set</Label>
                        <Input placeholder="S10 (optional)" value={codeSet}
                          onChange={(e) => setCodeSet(e.target.value.replace(/[^S\d]/gi, "").toUpperCase())}
                          className="text-gray-900 bg-muted/50 border-transparent shadow-none font-mono" />
                      </div>
                    </div>
                  )}
                </div>
              )}

                  {editing ? (
                    <div className="flex h-10 items-center gap-2 rounded-md bg-primary/5 px-3 border border-primary/20">
                      <span className="text-sm text-gray-900 flex-1">
                        {categories.find((c) => c.id === form.categoryId)?.name ?? "—"}
                      </span>
                      <Lock className="h-3.5 w-3.5 text-primary/40 shrink-0" />
                    </div>
                  ) : (
                    <Select value={form.categoryId} onValueChange={(v) => {
                      const cat = categories.find((c) => c.id === v);
                      const forced = cat ? (
                        ["KRU", "ELE", "BOOK", "TOY"].includes(cat.category) ? true
                        : ["CON", "MED"].includes(cat.category) ? false
                        : undefined
                      ) : undefined;
                      setForm({ ...form, categoryId: v ?? "", code: "", ...(forced !== undefined ? { trackIndividually: forced } : {}) });
                      setCodeGroup(""); setCodeSubcode(""); setCodeSet("");
                      setCodeLocked(true); setSuggestedCode(""); setExistingItems([]); setCodeGroups([]);
                    }}>
                      <SelectTrigger className="h-10 bg-muted/50 border-transparent shadow-none">
                        <span className={form.categoryId ? "text-gray-900" : "text-muted-foreground"}>
                          {form.categoryId ? (categories.find((c) => c.id === form.categoryId)?.name ?? "Select") : "เลือก..."}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">ชื่อไทย <span className="text-destructive">*</span></Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10 text-gray-900 bg-muted/50 border-transparent shadow-none" placeholder="เช่น เครื่องดื่มหัวปลีแบบผง" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">ชื่อ (EN)</Label>
                    <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} className="h-10 text-gray-900 bg-muted/50 border-transparent shadow-none" placeholder="e.g. Banana Blossom Drink" />
                  </div>
                </div>
              {nameDuplicates.length > 0 && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-300">
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-medium">พบชื่อคล้ายกันในระบบแล้ว — ตรวจสอบก่อนว่าไม่ใช่รายการเดิม</p>
                    {nameDuplicates.map((i) => (
                      <p key={i.code} className="font-mono">{i.code} — {i.name}</p>
                    ))}
                  </div>
                </div>
              )}
              </TabsContent>

              {/* ── Tab 2: หน่วย ── */}
              <TabsContent value="units" className="mt-0 space-y-4">
                {editing && (editing._count.dispenseRecords + editing._count.receiveRecords) > 0 && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-300">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="text-xs">
                      <p className="font-medium">มี {editing._count.dispenseRecords + editing._count.receiveRecords} transaction ที่อ้างอิงหน่วยปัจจุบัน</p>
                      <p className="text-amber-700 dark:text-amber-400 mt-0.5">เปลี่ยนหน่วยจะไม่กระทบ transaction เก่า แต่ตัวเลขอาจอ่านต่างกัน</p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">หน่วยหลัก <span className="text-destructive">*</span></Label>
                  <Select value={form.issueUnitId} onValueChange={(v) => setForm({ ...form, issueUnitId: v ?? "" })}>
                    <SelectTrigger className="h-10 bg-muted/50 border-transparent shadow-none">
                      <span className={form.issueUnitId ? "text-gray-900" : "text-muted-foreground"}>
                        {form.issueUnitId ? (units.find((u) => u.id === form.issueUnitId)?.name ?? "เลือกหน่วย") : "เลือกหน่วย"}
                      </span>
                    </SelectTrigger>
                    <SelectContent>{units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">หน่วยย่อย <span className="text-destructive">*</span></Label>
                    <Select value={form.subUnitId} onValueChange={(v) => setForm({ ...form, subUnitId: v ?? "" })}>
                      <SelectTrigger className="h-10 bg-muted/50 border-transparent shadow-none">
                        <span className={form.subUnitId ? "text-gray-900" : "text-muted-foreground"}>
                          {form.subUnitId ? (units.find((u) => u.id === form.subUnitId)?.name ?? "เลือกหน่วย") : "เลือกหน่วย"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>{units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground">อัตราแปลงหน่วย <span className="text-muted-foreground/60 font-normal">(1 หน่วยเบิก = ? หน่วยย่อย)</span></Label>
                  <Input type="number" min={1} value={form.conversionFactor} onChange={(e) => setForm({ ...form, conversionFactor: parseInt(e.target.value) || 1 })} className="h-10 text-gray-900 bg-muted/50 border-transparent shadow-none" />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">Track รายชิ้น (sub-codes)</div>
                    <div className="text-xs text-muted-foreground">
                      {trackForced === true ? "บังคับเปิด — หมวดหมู่นี้ต้องมี sub-code" : trackForced === false ? "ปิดเสมอสำหรับหมวดนี้" : "เปิดใช้ sub-codes ต่อชิ้น"}
                    </div>
                  </div>
                  <Switch
                    checked={trackForced !== undefined ? trackForced : form.trackIndividually}
                    onCheckedChange={trackForced !== undefined ? undefined : (v) => setForm({ ...form, trackIndividually: v })}
                    disabled={trackForced !== undefined}
                  />
                </div>
              </TabsContent>

              {/* ── Tab 3: สต็อก ── */}
              <TabsContent value="stock" className="mt-0 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">สถานที่จัดเก็บ</Label>
                    <Select value={form.locationId} onValueChange={(v) => setForm({ ...form, locationId: v === "__none__" ? "" : (v ?? "") })}>
                      <SelectTrigger className="h-10 bg-muted/50 border-transparent shadow-none">
                        <span className={form.locationId ? "text-gray-900" : "text-muted-foreground"}>
                          {form.locationId
                            ? (locations.find((l) => l.id === form.locationId) ? locationLabel(locations.find((l) => l.id === form.locationId)!) : "เลือกสถานที่")
                            : "เลือกสถานที่"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">ไม่ระบุ</SelectItem>
                        {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{locationLabel(loc)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">จำนวนขั้นต่ำ</Label>
                    <Input type="number" min={0} value={form.minThreshold} onChange={(e) => setForm({ ...form, minThreshold: parseInt(e.target.value) || 0 })} className="h-10 text-gray-900 bg-muted/50 border-transparent shadow-none" />
                  </div>
                </div>
              </TabsContent>

              {/* ── Tab 4: เพิ่มเติม ── */}
              <TabsContent value="more" className="mt-0 space-y-4">

                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground">คำอธิบาย</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="text-gray-900 bg-muted/50 border-transparent shadow-none resize-none" rows={3} />
                </div>
                {isConsumable && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">เงื่อนไขการจัดเก็บ</Label>
                    <Textarea value={form.storageRequirements} onChange={(e) => setForm({ ...form, storageRequirements: e.target.value })} className="text-gray-900 bg-muted/50 border-transparent shadow-none resize-none" placeholder="เช่น เก็บในตู้เย็น ไม่เกิน 30°C" rows={2} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground">รูปภาพ</Label>
                  <FileUpload value={form.imageUrl} onChange={(url) => setForm({ ...form, imageUrl: url })} accept="image/*" variant="zone" />
                </div>

                {isFixedAsset && (
                  <>
                    <Separator className="mt-2" />
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/60 pt-1">ข้อมูลครุภัณฑ์</p>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">รุ่น (Model)</Label>
                      <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="h-10 text-gray-900 bg-muted/50 border-transparent shadow-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">วันที่จัดซื้อ</Label>
                        <Input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className="h-10 text-gray-900 bg-muted/50 border-transparent shadow-none" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">ราคาจัดซื้อ</Label>
                        <Input type="number" step="0.01" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} className="h-10 text-gray-900 bg-muted/50 border-transparent shadow-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">บริษัท</Label>
                        <Input value={form.vendorCompany} onChange={(e) => setForm({ ...form, vendorCompany: e.target.value })} className="h-10 text-gray-900 bg-muted/50 border-transparent shadow-none" placeholder="Company name" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">ตัวแทน</Label>
                        <Input value={form.vendorContact} onChange={(e) => setForm({ ...form, vendorContact: e.target.value })} className="h-10 text-gray-900 bg-muted/50 border-transparent shadow-none" placeholder="Contact person" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">เบอร์โทร</Label>
                        <Input value={form.vendorPhone} onChange={(e) => setForm({ ...form, vendorPhone: e.target.value })} className="h-10 text-gray-900 bg-muted/50 border-transparent shadow-none" placeholder="Phone number" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">รับประกัน (เดือน)</Label>
                        <Input type="number" value={form.warrantyMonths} onChange={(e) => setForm({ ...form, warrantyMonths: parseInt(e.target.value) || 0 })} className="h-10 text-gray-900 bg-muted/50 border-transparent shadow-none" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">รอบซ่อมบำรุง (เดือน)</Label>
                        <Input type="number" value={form.maintenanceCycleMonths} onChange={(e) => setForm({ ...form, maintenanceCycleMonths: parseInt(e.target.value) || 12 })} className="h-10 text-gray-900 bg-muted/50 border-transparent shadow-none" />
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="mx-0 mb-0 px-6 py-3.5 border-t border-border/60 bg-muted/30 sm:justify-between">
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              แท็บ {DIALOG_TABS.findIndex((t) => t.value === dialogTab) + 1} / {DIALOG_TABS.length}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
              <Button onClick={handleSave} disabled={saving || !form.code || !form.name || !form.categoryId || !form.issueUnitId || !form.subUnitId}>
                {saving ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "บันทึกรายการ"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QrPrintDialog
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        items={items.filter((i) => selectedIds.has(i.id)).map((i) => ({ code: i.code, name: i.name }))}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบรายการพัสดุ</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบ &ldquo;{deleteTarget?.name}&rdquo; ({deleteTarget?.code}) ใช่หรือไม่? ดำเนินการนี้ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddItemModal
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        onCreated={() => {
          setAddItemOpen(false);
          fetchItems();
        }}
      />
    </div>
  );
}
