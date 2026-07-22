"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Lock, Info,
  Package, Ruler, Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericInput } from "@/components/shared/numeric-input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EditDialogShell } from "@/components/shared/edit-dialog-shell";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { LocationCascadePicker, type LocationRef, resolveLocationId } from "@/components/shared/location-cascade-picker";
import { useSession } from "@/components/layout/auth-guard";
import { getSettingsItem, getUnits, saveSettingsItem, updateSubItemFields } from "@/lib/api";
import { CONDITION_LABELS } from "@/lib/constants";
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
  countCycleMonths: number | null;
  storageRequirements: string | null;
  setSize: number;
  borrowLimit: number;
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
  countCycleMonths: string; // "" = follow the profile default (3 mo consumable, 12 mo rest)
  storageRequirements: string;
  setSize: number; borrowLimit: number; borrowable: boolean;
}

const emptyForm: FormState = {
  code: "", name: "", nameEn: "", categoryId: "", trackIndividually: false,
  issueUnitId: "", minThreshold: 0,
  locationId: "", description: "", isActive: true,
  imageUrl: null,
  model: "", purchaseDate: "", purchasePrice: "",
  vendorCompany: "", vendorContact: "", vendorPhone: "",
  warrantyMonths: 0, maintenanceCycleMonths: 12,
  countCycleMonths: "",
  storageRequirements: "",
  setSize: 1, borrowLimit: 0, borrowable: false,
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
    countCycleMonths: item.countCycleMonths != null ? String(item.countCycleMonths) : "",
    storageRequirements: item.storageRequirements || "",
    setSize: item.setSize ?? 1,
    borrowLimit: item.borrowLimit ?? 0,
    borrowable: item.borrowable ?? false,
  };
}

const DIALOG_TABS = [
  { value: "basic", label: "ข้อมูลพื้นฐาน", icon: Package },
  { value: "units", label: "หน่วยนับ", icon: Ruler },
  { value: "stock", label: "สถานที่จัดเก็บ", icon: Warehouse },
] as const;

const SUB_NONE = "__none__";

interface Props {
  open: boolean;
  itemId: string | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  /** piece-mode: the selected sub-item. Its serial/condition/notes/location are
   *  edited in the location tab and saved to the SubItem (item fields still save to Item). */
  subItem?: { id: string; serialNumber: string | null; condition: string | null; notes: string | null; locationId: string | null } | null;
}

export function EditItemDialog({ open, itemId, onOpenChange, onSaved, subItem }: Props) {
  const { categories } = useCategories();
  const { user } = useSession();
  const isSuperAdmin = user?.role === "ADMIN";
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [item, setItem] = useState<SettingsItem | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [locRef, setLocRef] = useState<LocationRef>({ kind: "none" });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // sub-item fields (piece-mode only) — serial/condition/notes edited in the location tab.
  const [subSerial, setSubSerial] = useState("");
  const [subCondition, setSubCondition] = useState("");
  const [subNotes, setSubNotes] = useState("");
  const [subLocRef, setSubLocRef] = useState<LocationRef>({ kind: "none" });

  useEffect(() => { getUnits().then(setUnits); }, []);

  // Fetch full Settings-shape item whenever the dialog opens for a new item.
  useEffect(() => {
    if (!open || !itemId) return;
    setLoading(true);
    setItem(null);
    setSubSerial(subItem?.serialNumber ?? "");
    setSubCondition(subItem?.condition ?? "");
    setSubNotes(subItem?.notes ?? "");
    getSettingsItem(itemId)
      .then((data) => {
        const it = data as SettingsItem;
        setItem(it);
        setForm(prefillFrom(it));
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
    // item location: in piece-mode the picker edits the sub-item instead, so the
    // item keeps its existing location. In item-mode the picker edits the item.
    const itemLocationId = subItem
      ? (form.locationId || null)
      : (locRef.kind === "ok" ? await resolveLocationId(locRef).catch(() => null) : (form.locationId || null));
    const payload = {
      ...form,
      nameEn: form.nameEn || null,
      locationId: itemLocationId,
      description: form.description || null,
      imageUrl: form.imageUrl || null,
      minThreshold: Number(form.minThreshold),
      maintenanceCycleMonths: Number(form.maintenanceCycleMonths),
      countCycleMonths: form.countCycleMonths === "" ? null : Number(form.countCycleMonths),
      warrantyMonths: Number(form.warrantyMonths),
      borrowLimit: Number(form.borrowLimit),
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
      // piece-mode: also persist the selected sub-item's identity + location.
      if (subItem) {
        const subLocationId = subLocRef.kind === "ok"
          ? await resolveLocationId(subLocRef).catch(() => null)
          : (subItem.locationId ?? null);
        await updateSubItemFields(itemId, subItem.id, {
          serialNumber: subSerial.trim() || null,
          condition: subCondition || null,
          notes: subNotes.trim() || null,
          locationId: subLocationId,
        });
      }
      toast.success("แก้ไขรายการสำเร็จ");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
    setSaving(false);
  }

  return (
    <EditDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="แก้ไขรายการ"
      description="แก้ไขข้อมูลพัสดุ"
      code={form.code}
      isActive={form.isActive}
      onToggleActive={(v) => setForm((f) => ({ ...f, isActive: v }))}
      saving={saving}
      saveDisabled={loading || !form.code || !form.name || !form.categoryId || !form.issueUnitId}
      onSave={handleSave}
      onCancel={() => onOpenChange(false)}
      tabs={loading || !item ? undefined : DIALOG_TABS}
    >

        {loading || !item ? (
          <div className="px-6 py-8 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : (
          <>
              {/* ── Tab 1: ข้อมูลพื้นฐาน ── */}
              <TabsContent value="basic" className="mt-0 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-medium text-muted-foreground" required>หมวดหมู่</Label>
                  {/* Category locked on edit — trackIndividually is forced by profile, sub-items reference it */}
                  <div className="flex h-10 items-center gap-2 rounded-md bg-primary/5 px-3 border border-primary/20">
                    <span className="text-sm text-foreground flex-1">
                      {categories.find((c) => c.id === form.categoryId)?.name ?? "—"}
                    </span>
                    <Lock className="h-3.5 w-3.5 text-primary/40 shrink-0" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground" required>ชื่อไทย</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10 text-foreground bg-muted/50 border border-input shadow-none" placeholder="เช่น เครื่องดื่มหัวปลีแบบผง" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">ชื่อ (EN)</Label>
                    <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} className="h-10 text-foreground bg-muted/50 border border-input shadow-none" placeholder="e.g. Banana Blossom Drink" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                  {isSetTracked && (
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">จำนวนในชุด (set) — มากกว่า 1 = เป็นชุด</Label>
                      <NumericInput
                        value={form.setSize}
                        onCommit={(n) => setForm({ ...form, setSize: n })}
                        min={1}
                        className="h-10 text-foreground bg-muted/50 border border-input shadow-none font-mono"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">จำนวนคงคลังขั้นต่ำ</Label>
                    <Input type="number" min={0} value={form.minThreshold} onChange={(e) => setForm({ ...form, minThreshold: parseInt(e.target.value) || 0 })} className="h-10 text-foreground bg-muted/50 border border-input shadow-none" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">รอบตรวจนับ (เดือน)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.countCycleMonths}
                      onChange={(e) => setForm({ ...form, countCycleMonths: e.target.value })}
                      placeholder="ค่าเริ่มต้น: สิ้นเปลือง 3 · อื่นๆ 12"
                      className="h-10 text-foreground bg-muted/50 border border-input shadow-none"
                    />
                  </div>
                  {/* Sits with the count cycle rather than in the ครุภัณฑ์ block: วัสดุคงทน and
                      หนังสือ/ของเล่น have a service cycle too — only consumables don't. */}
                  {!isConsumable && (
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">รอบซ่อมบำรุง (เดือน)</Label>
                      <Input type="number" min={1} value={form.maintenanceCycleMonths} onChange={(e) => setForm({ ...form, maintenanceCycleMonths: parseInt(e.target.value) || 12 })} className="h-10 text-foreground bg-muted/50 border border-input shadow-none" />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-medium text-muted-foreground">
                      จำนวนที่อนุญาตให้ยืม {!isSuperAdmin && <Lock className="inline h-3 w-3 align-[-1px] text-primary/40" />}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.borrowLimit}
                      onChange={(e) => setForm({ ...form, borrowLimit: parseInt(e.target.value) || 0 })}
                      disabled={!isSuperAdmin}
                      className="h-10 text-foreground bg-muted/50 border border-input shadow-none disabled:opacity-100 disabled:text-muted-foreground"
                    />
                    <p className="text-[10px] text-muted-foreground">0 = ไม่อนุญาตให้ยืม{!isSuperAdmin && " · แก้ไขได้เฉพาะ SuperAdmin"}</p>
                  </div>
                </div>

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
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">รับประกัน (เดือน)</Label>
                      <Input type="number" value={form.warrantyMonths} onChange={(e) => setForm({ ...form, warrantyMonths: parseInt(e.target.value) || 0 })} className="h-10 text-foreground bg-muted/50 border border-input shadow-none" />
                    </div>
                  </>
                )}
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
                  <Label className="text-[11px] font-medium text-muted-foreground" required>หน่วย</Label>
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
                  <Label className="text-[11px] font-medium text-muted-foreground">
                    สถานที่จัดเก็บ{subItem ? " (ของชิ้นนี้)" : ""}
                  </Label>
                  <LocationCascadePicker
                    initialLocationId={subItem ? (subItem.locationId || form.locationId || null) : (form.locationId || null)}
                    onChange={subItem ? setSubLocRef : setLocRef}
                  />
                </div>

                {subItem && (
                  <>
                    <Separator className="mt-2" />
                    <p className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-primary/60">ข้อมูลพัสดุย่อย</p>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">หมายเลขซีเรียล</Label>
                      <Input value={subSerial} onChange={(e) => setSubSerial(e.target.value)} className="h-10 bg-muted/50 border border-input shadow-none" placeholder="ไม่ระบุ" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">สภาพ</Label>
                      <Select value={subCondition || SUB_NONE} onValueChange={(v) => setSubCondition(v === SUB_NONE ? "" : v ?? "")}>
                        <SelectTrigger className="h-10 bg-muted/50 border border-input shadow-none">
                          <SelectValue>{subCondition ? (CONDITION_LABELS[subCondition] ?? subCondition) : "ไม่ระบุ"}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SUB_NONE}>ไม่ระบุ</SelectItem>
                          {Object.entries(CONDITION_LABELS).map(([v, label]) => (
                            <SelectItem key={v} value={v}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-muted-foreground">หมายเหตุ</Label>
                      <Textarea value={subNotes} onChange={(e) => setSubNotes(e.target.value)} rows={2} className="bg-muted/50 border border-input shadow-none resize-none" placeholder="หมายเหตุ (optional)" />
                    </div>
                  </>
                )}
              </TabsContent>

          </>
        )}

    </EditDialogShell>
  );
}
