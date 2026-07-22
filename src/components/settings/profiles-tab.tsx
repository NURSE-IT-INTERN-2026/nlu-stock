"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Layers, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getProfiles, createProfile, updateProfile, deleteProfile } from "@/lib/api";
import type { ProfileOption } from "@/lib/api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { PROFILE_COLOR_OPTIONS, profileIcon } from "@/lib/profile-icons";
import { IconColorPicker } from "./icon-picker";

const DISPENSE_OPTIONS: { value: "CONSUMABLE" | "COUNT" | "ITEM"; label: string }[] = [
  { value: "CONSUMABLE", label: "ใช้แล้วทิ้ง" },
  { value: "COUNT", label: "ยืม-คืน (นับจำนวน)" },
  { value: "ITEM", label: "ยืม-คืน (รายชิ้น)" },
];

function dispenseLabel(d: string) {
  return DISPENSE_OPTIONS.find((o) => o.value === d)?.label ?? d;
}

const DISPENSE_HELP: Record<string, string> = {
  CONSUMABLE: "ใช้แล้วหมดไป ต้องระบุเลขล็อตตอนรับเข้า",
  COUNT: "ยืม-คืนได้ นับเป็นจำนวนรวม ไม่แยกรายชิ้น",
  ITEM: "ยืม-คืนได้ ระบบสร้างรหัสย่อยติดตามแต่ละชิ้น",
};

interface FormState {
  name: string;
  code: string;
  dispenseType: "CONSUMABLE" | "COUNT" | "ITEM";
  assetTracking: boolean;
  setTracking: boolean;
  icon: string;
  color: string;
  description: string;
}

const EMPTY_FORM: FormState = {
  name: "", code: "", dispenseType: "CONSUMABLE",
  assetTracking: false, setTracking: false,
  icon: "Package", color: PROFILE_COLOR_OPTIONS[0].value, description: "",
};

export function ProfilesTab() {
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProfileOption | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProfileOption | null>(null);

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProfiles();
      setProfiles(data);
    } catch {
      toast.error("โหลดข้อมูลไม่สำเร็จ");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(p: ProfileOption) {
    setEditing(p);
    setForm({
      name: p.name, code: p.code, dispenseType: p.dispenseType,
      assetTracking: p.assetTracking, setTracking: p.setTracking,
      icon: p.icon, color: p.color, description: p.description ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editing) {
        await updateProfile(editing.id, {
          name: form.name,
          description: form.description || undefined,
          icon: form.icon,
          color: form.color,
          // behavior fields only apply if no items; API enforces otherwise (409)
          code: form.code,
          dispenseType: form.dispenseType,
          assetTracking: form.assetTracking,
          setTracking: form.setTracking,
        });
        toast.success("อัปเดตประเภทสำเร็จ");
      } else {
        await createProfile({
          name: form.name, code: form.code, dispenseType: form.dispenseType,
          assetTracking: form.assetTracking, setTracking: form.setTracking,
          icon: form.icon, color: form.color, description: form.description || undefined,
        });
        toast.success("สร้างประเภทสำเร็จ");
      }
      setDialogOpen(false);
      fetchProfiles();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
    setSaving(false);
  }

  async function handleToggleActive(p: ProfileOption) {
    try {
      await updateProfile(p.id, { isActive: !p.isActive });
      fetchProfiles();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อัปเดตไม่สำเร็จ");
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteProfile(deleteTarget.id);
      toast.success("ลบประเภทสำเร็จ");
      fetchProfiles();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
    setDeleteTarget(null);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  // ── Modal shell elements (shared by Dialog + Sheet) ──────────
  const title = editing ? "แก้ไขประเภท" : "เพิ่มประเภท";
  const subtitle = editing ? "แก้ไขข้อมูลประเภทหลัก" : "ตั้งค่าประเภทพัสดุหลัก";
  const canSave = !form.name || !form.code || saving;

  const modalHeader = (
    <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Layers className="h-4 w-4" />
        </div>
        <div>
          <p className="text-base font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <button
        onClick={() => setDialogOpen(false)}
        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        aria-label="ปิด"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  const modalBody = (
    <div className="flex-1 overflow-y-auto bg-secondary/40 px-6 py-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="p-name" required>ชื่อประเภท</Label>
          <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="เช่น ครุภัณฑ์ทางการแพทย์" className="bg-card" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-code" required>รหัสย่อ</Label>
          <Input id="p-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="MED" maxLength={6} className="bg-card font-mono uppercase" />
          <p className="text-xs text-muted-foreground mt-1">ตัวอักษรภาษาอังกฤษพิมพ์ใหญ่ 2-6 ตัว — ใช้ในรหัสพัสดุ NLU-รหัส-001</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-dispense" required>ประเภทการเบิกจ่าย</Label>
          <Select value={form.dispenseType} onValueChange={(v) => v && setForm({ ...form, dispenseType: v as FormState["dispenseType"] })}>
            <SelectTrigger id="p-dispense" className="bg-card"><SelectValue>{dispenseLabel(form.dispenseType)}</SelectValue></SelectTrigger>
            <SelectContent>
              {DISPENSE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">{DISPENSE_HELP[form.dispenseType]}</p>
        </div>
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <div>
            <p className="text-sm font-medium">ตั้งค่าเพิ่มเติม</p>
            <p className="text-xs text-muted-foreground">เลือกได้อิสระ ไม่ผูกกับประเภทการเบิกจ่ายด้านบน</p>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-2">
              <Label htmlFor="p-asset" className="text-sm">ติดตามทรัพย์สิน (จัดซื้อ/บำรุงรักษา)</Label>
              <p className="text-xs text-muted-foreground">เปิดถ้าต้องขึ้นทะเบียนครุภัณฑ์ กรอกข้อมูลผู้ขาย ราคา รับประกัน และรอบซ่อมบำรุง</p>
            </div>
            <Switch id="p-asset" checked={form.assetTracking} onCheckedChange={(v) => setForm({ ...form, assetTracking: v })} />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 pr-2">
              <Label htmlFor="p-set" className="text-sm">ติดตามเป็นชุด</Label>
              <p className="text-xs text-muted-foreground">ใช้เมื่อ 1 หน่วยที่รับเข้าประกอบด้วยหลายชิ้นย่อย เช่น หนังสือ 1 ชุด มี 6 เล่ม</p>
            </div>
            <Switch id="p-set" checked={form.setTracking} onCheckedChange={(v) => setForm({ ...form, setTracking: v })} />
          </div>
          {editing && <p className="text-xs text-amber-600 mt-1">⚠ เปลี่ยนพฤติกรรมไม่ได้ถ้าประเภทนี้มีพัสดุอยู่</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-icon">ไอคอนและสี</Label>
          <IconColorPicker
            icon={form.icon}
            color={form.color}
            onIconChange={(v) => setForm({ ...form, icon: v })}
            onColorChange={(v) => setForm({ ...form, color: v })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-desc">รายละเอียด</Label>
          <Textarea id="p-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-card" />
        </div>
      </div>
    </div>
  );

  const modalFooter = (
    <div className="flex items-center justify-between border-t border-border bg-card px-6 py-4">
      <Button variant="ghost" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
      <Button onClick={handleSave} disabled={canSave}>
        {saving ? "กำลังบันทึก..." : editing ? "บันทึก" : "สร้าง"}
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">จัดการประเภทหลัก — เพิ่ม/ซ่อน/ลบ ประเภทพัสดุ</p>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />เพิ่มประเภท</Button>
      </div>

      <div className="rounded-2xl border bg-card shadow-sm md:overflow-clip">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="sticky top-0 z-10 bg-card border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)] [&>th]:h-8 [&>th]:py-0 [&>th]:text-xs [&>th]:text-muted-foreground">
              <TableHead className="px-2">ประเภท</TableHead>
              <TableHead className="w-24 px-2">รหัส</TableHead>
              <TableHead className="w-40 px-2">การเบิกจ่าย</TableHead>
              <TableHead className="w-32 px-2">คุณสมบัติเพิ่มเติม</TableHead>
              <TableHead className="w-20 px-2">หมวด</TableHead>
              <TableHead className="w-20 px-2">เปิดใช้</TableHead>
              <TableHead className="w-[100px] px-2">การดำเนินการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-12">
                <div className="flex flex-col items-center gap-3 text-center">
                  <Layers className="h-8 w-8 text-muted-foreground/40" />
                  <div>
                    <p className="text-sm font-medium text-foreground">ไม่มีประเภท</p>
                    <p className="text-xs text-muted-foreground mt-0.5">สร้างประเภทแรก</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />เพิ่มประเภท</Button>
                </div>
              </TableCell></TableRow>
            ) : profiles.map((p) => {
              const Icon = profileIcon(p.icon);
              return (
                <TableRow key={p.id} className={`h-9 [&>td]:py-1 ${!p.isActive ? "opacity-50" : ""}`}>
                  <TableCell className="px-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`grid place-items-center size-7 rounded-lg ${p.color}`}><Icon className="h-4 w-4" /></span>
                      <span className="truncate min-w-0 font-medium">{p.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs px-2"><span className="block truncate">{p.code}</span></TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap px-2">{dispenseLabel(p.dispenseType)}</TableCell>
                  <TableCell className="px-2">
                    <div className="flex flex-wrap gap-1">
                      {p.assetTracking && <Badge variant="secondary" className="px-1.5 py-0 leading-5 text-[11px]">ทรัพย์สิน</Badge>}
                      {p.setTracking && <Badge variant="secondary" className="px-1.5 py-0 leading-5 text-[11px]">ชุด</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs px-2 tabular-nums">{p._count?.subCategories ?? 0}</TableCell>
                  <TableCell className="px-2">
                    <Switch checked={p.isActive} onCheckedChange={() => handleToggleActive(p)} aria-label="เปิด/ปิด" />
                  </TableCell>
                  <TableCell className="px-2">
                    <TooltipProvider>
                      <div className="flex gap-1">
                        <Tooltip>
                          <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => openEdit(p)} aria-label="แก้ไข" />}>
                            <Pencil className="h-3.5 w-3.5" />
                          </TooltipTrigger>
                          <TooltipContent>แก้ไข</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => setDeleteTarget(p)} aria-label="ลบ" />}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </TooltipTrigger>
                          <TooltipContent>ลบ</TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {isDesktop ? (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg gap-0 overflow-hidden p-0 sm:rounded-2xl" showCloseButton={false}>
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <DialogDescription className="sr-only">{subtitle}</DialogDescription>
            <div className="flex max-h-[85vh] flex-col overflow-hidden">
              {modalHeader}
              {modalBody}
              {modalFooter}
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
          <SheetContent side="bottom" className="h-[90vh] rounded-t-2xl gap-0 p-0 overflow-hidden" showCloseButton={false}>
            <SheetTitle className="sr-only">{title}</SheetTitle>
            <SheetDescription className="sr-only">{subtitle}</SheetDescription>
            <div className="flex h-full flex-col overflow-hidden">
              {modalHeader}
              {modalBody}
              {modalFooter}
            </div>
          </SheetContent>
        </Sheet>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบประเภท</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบประเภท &ldquo;{deleteTarget?.name}&rdquo; ใช่หรือไม่? ลบได้เฉพาะประเภทที่ไม่มีหมวดหมู่ย่อย
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
