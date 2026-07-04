"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Pencil, Lock, Copy, Check, Info,
  Package, Ruler, Warehouse, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "motion/react";
import { Separator } from "@/components/ui/separator";
import { FileUpload } from "@/components/shared/file-upload";
import { LocationCascadePicker } from "@/components/shared/location-cascade-picker";
import { getSettingsItem, getUnits, saveSettingsItem } from "@/lib/api";
import type { CategoryOption, LocationOption, UnitOption } from "@/lib/api";
import { useCategories } from "@/hooks/use-lookup-data";

// Full Settings-shape item (matches /api/settings/items/[id] GET include).
interface SettingsItem {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  categoryId: string;
  category: CategoryOption;
  trackIndividually: boolean;
  issueUnitId: string;
  issueUnit: UnitOption;
  minThreshold: number;
  locationId: string | null;
  location: LocationOption | null;
  imageUrl: string | null;
  description: string | null;
  isActive: boolean;
  model: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  vendorCompany: string | null;
  vendorContact: string | null;
  vendorPhone: string | null;
  warrantyMonths: number;
  maintenanceCycleMonths: number;
  storageRequirements: string | null;
  setSize: number;
  borrowable: boolean;
  _count: { subItems: number; dispenseRecords: number; receiveRecords: number };
}

interface FormState {
  code: string; name: string; nameEn: string; categoryId: string; trackIndividually: boolean;
  issueUnitId: string; minThreshold: number;
  locationId: string; description: string; isActive: boolean;
  imageUrl: string | null;
  model: string; purchaseDate: string; purchasePrice: string;
  vendorCompany: string; vendorContact: string; vendorPhone: string;
  warrantyMonths: number; maintenanceCycleMonths: number;
  storageRequirements: string;
  setSize: number; borrowable: boolean;
}

const emptyForm: FormState = {
  code: "", name: "", nameEn: "", categoryId: "", trackIndividually: false,
  issueUnitId: "", minThreshold: 0,
  locationId: "", description: "", isActive: true,
  imageUrl: null,
  model: "", purchaseDate: "", purchasePrice: "",
  vendorCompany: "", vendorContact: "", vendorPhone: "",
  warrantyMonths: 0, maintenanceCycleMonths: 12,
  storageRequirements: "",
  setSize: 1, borrowable: false,
};

function prefillFrom(item: SettingsItem): FormState {
  return {
    code: item.code,
    name: item.name,
    nameEn: item.nameEn || "",
    categoryId: item.categoryId,
    trackIndividually: item.trackIndividually,
    issueUnitId: item.issueUnitId,
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
    setSize: item.setSize ?? 1,
    borrowable: item.borrowable ?? false,
  };
}

const DIALOG_TABS = [
  { value: "basic", label: "ข้อมูลพื้นฐาน", icon: Package },
  { value: "units", label: "หน่วย", icon: Ruler },
  { value: "stock", label: "สต็อก", icon: Warehouse },
  { value: "more", label: "เพิ่มเติม", icon: FileText },
] as const;

interface Props {
  open: boolean;
  itemId: string | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

export function EditItemDialog({ open, itemId, onOpenChange, onSaved }: Props) {
  const { categories } = useCategories();
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [item, setItem] = useState<SettingsItem | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogTab, setDialogTab] = useState("basic");
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => { getUnits().then(setUnits); }, []);

  // Fetch full Settings-shape item whenever the dialog opens for a new item.
  useEffect(() => {
    if (!open || !itemId) return;
    setLoading(true);
    setItem(null);
    getSettingsItem(itemId)
      .then((data) => {
        const it = data as SettingsItem;
        setItem(it);
        setForm(prefillFrom(it));
        setDialogTab("basic");
      })
      .catch(() => toast.error("โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [open, itemId]);

  // Profile drives field gating (comes from categories lookup, not the item).
  const selectedCategory = categories.find((c) => c.id === form.categoryId);
  const profile = selectedCategory?.profile ?? null;
  const isSetTracked = profile?.setTracking ?? false;
  const isFixedAsset = profile?.assetTracking ?? false;
  const isConsumable = profile?.dispenseType === "CONSUMABLE";
  const trackForced = profile ? profile.dispenseType === "ITEM" : undefined;

  async function handleSave() {
    if (!itemId) return;
    setSaving(true);
    const payload = {
      ...form,
      nameEn: form.nameEn || null,
      locationId: form.locationId || null,
      description: form.description || null,
      imageUrl: form.imageUrl || null,
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
      await saveSettingsItem(payload, itemId);
      toast.success("แก้ไขรายการสำเร็จ");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-[640px] gap-0 p-0 overflow-hidden">
        <DialogHeader className="flex-row items-center gap-3 border-b border-border bg-card px-6 py-4 pr-14">
          <div className="flex items-center gap-3 shrink-0 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Pencil className="h-4 w-4" />
            </div>
            <DialogTitle className="text-base font-semibold text-foreground shrink-0">
              แก้ไขรายการ
            </DialogTitle>
            {/* Code badge — read-only (identity), copy only */}
            <div className="flex items-center gap-1 rounded-full border border-orange-300/50 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800 pl-2.5 pr-1 py-1 shrink-0">
              <span className="font-mono text-xs font-semibold text-orange-600 dark:text-orange-300 tabular-nums ml-1">
                {form.code || "—"}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (form.code) {
                    navigator.clipboard.writeText(form.code);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 1500);
                  }
                }}
                className="h-6 w-6 flex items-center justify-center rounded-full text-orange-400 hover:text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors"
                aria-label="คัดลอกรหัส"
              >
                {copiedCode ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>
          <div className="flex-1" />
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
          <DialogDescription className="sr-only">แก้ไขข้อมูลพัสดุ</DialogDescription>
        </DialogHeader>

        {loading || !item ? (
          <div className="px-6 py-8 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : (
          <Tabs value={dialogTab} onValueChange={setDialogTab} className="flex flex-col">
            <TabsList className="relative mx-6 mt-4 grid grid-cols-4 h-9 bg-muted/60 p-0 shrink-0">
              <motion.span
                className="absolute inset-y-[3px] left-0 rounded-md bg-primary/10"
                style={{ width: "25%" }}
                animate={{ x: `${Math.max(0, DIALOG_TABS.findIndex((t) => t.value === dialogTab)) * 100}%` }}
                initial={false}
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
              />
              {DIALOG_TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <TabsTrigger key={t.value} value={t.value} className="text-xs gap-1.5 data-active:!bg-transparent data-active:!text-primary data-active:!shadow-none">
                    <span className="relative z-10 flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{t.label}</span>
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <div className="px-6 py-5 min-h-[300px] max-h-[55vh] overflow-y-auto bg-secondary/40">
              {/* ── Tab 1: ข้อมูลพื้นฐาน ── */}
              <TabsContent value="basic" className="mt-0 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground">หมวดหมู่ <span className="text-destructive">*</span></Label>
                  {/* Category locked on edit — trackIndividually is forced by profile, sub-items reference it */}
                  <div className="flex h-10 items-center gap-2 rounded-md bg-primary/5 px-3 border border-primary/20">
                    <span className="text-sm text-foreground flex-1">
                      {categories.find((c) => c.id === form.categoryId)?.name ?? "—"}
                    </span>
                    <Lock className="h-3.5 w-3.5 text-primary/40 shrink-0" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                  {isSetTracked && (
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">จำนวนในชุด (set) — มากกว่า 1 = เป็นชุด</Label>
                      <Input
                        type="number" min={1} value={form.setSize}
                        onChange={(e) => setForm({ ...form, setSize: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="h-10 text-foreground bg-muted/50 border border-input shadow-none font-mono"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">จำนวนขั้นต่ำ</Label>
                    <Input type="number" min={0} value={form.minThreshold} onChange={(e) => setForm({ ...form, minThreshold: parseInt(e.target.value) || 0 })} className="h-10 text-foreground bg-muted/50 border border-input shadow-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">ชื่อไทย <span className="text-destructive">*</span></Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10 text-foreground bg-muted/50 border border-input shadow-none" placeholder="เช่น เครื่องดื่มหัวปลีแบบผง" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">ชื่อ (EN)</Label>
                    <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} className="h-10 text-foreground bg-muted/50 border border-input shadow-none" placeholder="e.g. Banana Blossom Drink" />
                  </div>
                </div>
              </TabsContent>

              {/* ── Tab 2: หน่วย ── */}
              <TabsContent value="units" className="mt-0 space-y-4">
                {item._count && (item._count.dispenseRecords + item._count.receiveRecords) > 0 && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-300">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="text-xs">
                      <p className="font-medium">มี {item._count.dispenseRecords + item._count.receiveRecords} transaction ที่อ้างอิงหน่วยปัจจุบัน</p>
                      <p className="text-amber-700 dark:text-amber-400 mt-0.5">เปลี่ยนหน่วยจะไม่กระทบ transaction เก่า แต่ตัวเลขอาจอ่านต่างกัน</p>
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground">หน่วย <span className="text-destructive">*</span></Label>
                  <Select value={form.issueUnitId} onValueChange={(v) => setForm({ ...form, issueUnitId: v ?? "" })}>
                    <SelectTrigger className="h-10 bg-muted/50 border border-input shadow-none">
                      <span className={form.issueUnitId ? "text-foreground" : "text-muted-foreground"}>
                        {form.issueUnitId ? (units.find((u) => u.id === form.issueUnitId)?.name ?? "เลือกหน่วย") : "เลือกหน่วย"}
                      </span>
                    </SelectTrigger>
                    <SelectContent>{units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
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
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground">สถานที่จัดเก็บ</Label>
                  <LocationCascadePicker
                    initialLocationId={form.locationId || null}
                    onChange={(id) => setForm((f) => ({ ...f, locationId: id ?? "" }))}
                  />
                </div>
              </TabsContent>

              {/* ── Tab 4: เพิ่มเติม ── */}
              <TabsContent value="more" className="mt-0 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground">คำอธิบาย</Label>
                  <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="text-foreground bg-muted/50 border border-input shadow-none resize-none" rows={3} />
                </div>
                {isConsumable && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">เงื่อนไขการจัดเก็บ</Label>
                    <Textarea value={form.storageRequirements} onChange={(e) => setForm({ ...form, storageRequirements: e.target.value })} className="text-foreground bg-muted/50 border border-input shadow-none resize-none" placeholder="เช่น เก็บในตู้เย็น ไม่เกิน 30°C" rows={2} />
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
                      <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="h-10 text-foreground bg-muted/50 border border-input shadow-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">วันที่จัดซื้อ</Label>
                        <Input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className="h-10 text-foreground bg-muted/50 border border-input shadow-none" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">ราคาจัดซื้อ</Label>
                        <Input type="number" step="0.01" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} className="h-10 text-foreground bg-muted/50 border border-input shadow-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">บริษัท</Label>
                        <Input value={form.vendorCompany} onChange={(e) => setForm({ ...form, vendorCompany: e.target.value })} className="h-10 text-foreground bg-muted/50 border border-input shadow-none" placeholder="Company name" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">ตัวแทน</Label>
                        <Input value={form.vendorContact} onChange={(e) => setForm({ ...form, vendorContact: e.target.value })} className="h-10 text-foreground bg-muted/50 border border-input shadow-none" placeholder="Contact person" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">เบอร์โทร</Label>
                        <Input value={form.vendorPhone} onChange={(e) => setForm({ ...form, vendorPhone: e.target.value })} className="h-10 text-foreground bg-muted/50 border border-input shadow-none" placeholder="Phone number" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">รับประกัน (เดือน)</Label>
                        <Input type="number" value={form.warrantyMonths} onChange={(e) => setForm({ ...form, warrantyMonths: parseInt(e.target.value) || 0 })} className="h-10 text-foreground bg-muted/50 border border-input shadow-none" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-medium text-muted-foreground">รอบซ่อมบำรุง (เดือน)</Label>
                        <Input type="number" value={form.maintenanceCycleMonths} onChange={(e) => setForm({ ...form, maintenanceCycleMonths: parseInt(e.target.value) || 12 })} className="h-10 text-foreground bg-muted/50 border border-input shadow-none" />
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>
            </div>
          </Tabs>
        )}

        <DialogFooter className="mx-0 mb-0 px-6 py-3.5 border-t border-border/60 bg-muted/30 sm:justify-between">
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            แท็บ {DIALOG_TABS.findIndex((t) => t.value === dialogTab) + 1} / {DIALOG_TABS.length}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving || loading || !form.code || !form.name || !form.categoryId || !form.issueUnitId}>
              {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
