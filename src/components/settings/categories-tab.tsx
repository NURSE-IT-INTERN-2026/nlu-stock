"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DIALOG_SHELL_FIT,
  DIALOG_BODY,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getCategories, updateCategory, deleteCategory, getProfiles } from "@/lib/api";
import type { ProfileOption } from "@/lib/api";
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
import { Skeleton } from "@/components/ui/skeleton";
import { CategorySelectModal } from "@/components/shared/category-select-modal";

interface CategoryType {
  id: string;
  name: string;
  profile: ProfileOption | null;
  description: string | null;
  sortOrder: number;
  _count: { items: number };
}

function dispenseTypeLabel(p: ProfileOption | null): string {
  if (!p) return "—";
  if (p.dispenseType === "CONSUMABLE") return "ตัดจ่ายจริงตามจำนวน";
  if (p.dispenseType === "COUNT") return "ยืม-คืน ตามจำนวน";
  return "ยืม-คืน ตาม Code";
}

function CategoryRow({ cat, onEdit, onDelete }: { cat: CategoryType; onEdit: (c: CategoryType) => void; onDelete: (c: CategoryType) => void }) {
  return (
    <TableRow className="h-9 [&>td]:py-1">
      <TableCell className="px-2"><span className="block truncate font-medium">{cat.name}</span></TableCell>
      <TableCell className="px-2"><Badge variant="outline" className={cn("px-1.5 py-0 leading-5 text-[11px]", cat.profile?.color)}>{cat.profile?.name ?? "—"}</Badge></TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap px-2">{dispenseTypeLabel(cat.profile)}</TableCell>
      <TableCell className="text-xs px-2 tabular-nums">{cat._count.items}</TableCell>
      <TableCell className="px-2">
        <TooltipProvider>
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => onEdit(cat)} aria-label="แก้ไข" />}>
                <Pencil className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>แก้ไข</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => onDelete(cat)} aria-label="ลบ" />}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </TooltipTrigger>
              <TooltipContent>ลบ</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );
}

export function CategoriesTab() {
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectModalOpen, setSelectModalOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryType | null>(null);
  const [filterProfile, setFilterProfile] = useState<string>("ALL");
  const [form, setForm] = useState({ name: "", profileId: "" as string, description: "" });
  const [deleteTarget, setDeleteTarget] = useState<CategoryType | null>(null);

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCategories();
      setCategories(data as CategoryType[]);
    } catch {
      toast.error("โหลดข้อมูลไม่สำเร็จ");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
    getProfiles().then(setProfiles).catch(() => setProfiles([]));
  }, [fetchCategories]);

  function openCreate() {
    setSelectModalOpen(true);
  }

  function openEdit(cat: CategoryType) {
    setEditing(cat);
    setForm({ name: cat.name, profileId: cat.profile?.id ?? "", description: cat.description || "" });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!editing) return;
    const payload = {
      name: form.name,
      profileId: form.profileId,
      description: form.description || undefined,
    };

    try {
      await updateCategory(editing.id, payload);
      toast.success("อัปเดตหมวดหมู่สำเร็จ");
      setDialogOpen(false);
      fetchCategories();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function handleDelete(cat: CategoryType) {
    setDeleteTarget(cat);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteCategory(deleteTarget.id);
      toast.success("ลบหมวดหมู่สำเร็จ");
      fetchCategories();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
    setDeleteTarget(null);
  }

  const filtered = filterProfile === "ALL" ? categories : categories.filter((c) => c.profile?.id === filterProfile);

  if (loading) return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-8 w-16" />
      </div>
      <div className="rounded-2xl border overflow-hidden bg-card">
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Modal shell elements (shared by Dialog + Sheet) ──────────
  const title = editing ? "แก้ไขหมวดหมู่" : "เพิ่มหมวดหมู่";
  const subtitle = editing ? "แก้ไขข้อมูลหมวดหมู่" : "เพิ่มหมวดหมู่ใหม่";

  const modalHeader = (
    <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Tag className="h-4 w-4" />
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
    <div className={cn(DIALOG_BODY, "bg-secondary/40 px-6 py-6")}>
      <div className="space-y-4">
        <div>
          <Label htmlFor="cat-name">ชื่อหมวดหมู่</Label>
          <Input id="cat-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-card" />
        </div>
        <div>
          <Label htmlFor="cat-type">ประเภท</Label>
          <Select value={form.profileId} onValueChange={(v) => setForm({ ...form, profileId: v! })}>
            <SelectTrigger className="bg-card"><SelectValue placeholder="เลือกประเภท">{profiles.find((p) => p.id === form.profileId)?.name ?? "เลือกประเภท"}</SelectValue></SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="cat-desc">รายละเอียด</Label>
          <Textarea id="cat-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-card" />
        </div>
      </div>
    </div>
  );

  const modalFooter = (
    <div className="flex items-center justify-between border-t border-border bg-card px-6 py-4">
      <Button variant="ghost" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
      <Button onClick={handleSave} disabled={!form.name}>{editing ? "บันทึก" : "สร้าง"}</Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterPill active={filterProfile === "ALL"} onClick={() => setFilterProfile("ALL")}>
            ทุกประเภท
          </FilterPill>
          {profiles.map((p) => (
            <FilterPill key={p.id} active={filterProfile === p.id} onClick={() => setFilterProfile(p.id)} color={p.color}>
              {p.name}
            </FilterPill>
          ))}
        </div>
        <Button size="sm" onClick={openCreate} className="shrink-0"><Plus className="h-4 w-4 mr-1" />เพิ่มหมวดหมู่</Button>
      </div>

      <div className="rounded-2xl border overflow-hidden bg-card shadow-sm">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="sticky top-0 z-10 bg-card border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)] [&>th]:h-8 [&>th]:py-0 [&>th]:text-xs [&>th]:text-muted-foreground">
              <TableHead className="px-2">ชื่อหมวดหมู่</TableHead>
              <TableHead className="w-32 px-2">ประเภท</TableHead>
              <TableHead className="w-40 px-2">ประเภทการเบิกจ่าย</TableHead>
              <TableHead className="w-20 px-2">จำนวน</TableHead>
              <TableHead className="w-[100px] px-2">การดำเนินการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-12">
                <div className="flex flex-col items-center gap-3 text-center">
                  <Tag className="h-8 w-8 text-muted-foreground/40" />
                  <div>
                    <p className="text-sm font-medium text-foreground">ไม่มีหมวดหมู่</p>
                    <p className="text-xs text-muted-foreground mt-0.5">ลองเปลี่ยนตัวกรอง หรือสร้างใหม่</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />เพิ่มหมวดหมู่</Button>
                </div>
              </TableCell></TableRow>
            ) : filtered.map((cat) => (
              <CategoryRow key={cat.id} cat={cat} onEdit={openEdit} onDelete={handleDelete} />
            ))}
          </TableBody>
        </Table>
      </div>

      {isDesktop ? (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg gap-0 overflow-hidden p-0 sm:rounded-2xl" showCloseButton={false}>
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <DialogDescription className="sr-only">{subtitle}</DialogDescription>
            <div className={DIALOG_SHELL_FIT}>
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
            <AlertDialogTitle>ลบหมวดหมู่</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบหมวดหมู่ &ldquo;{deleteTarget?.name}&rdquo; ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CategorySelectModal
        open={selectModalOpen}
        onClose={() => setSelectModalOpen(false)}
        onSelect={() => {
          fetchCategories();
          setSelectModalOpen(false);
        }}
        title="เพิ่มหมวดหมู่"
        mode="create"
      />
    </div>
  );
}

function FilterPill({ active, onClick, color, children }: {
  active: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : color
            ? cn(color, "border-current/30 hover:border-current/60")
            : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      {children}
    </button>
  );
}
