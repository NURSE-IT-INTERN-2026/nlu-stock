"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Category, CATEGORY_LABELS } from "@/lib/constants";
import { getCategories, updateCategory, deleteCategory } from "@/lib/api";
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
  category: string;
  description: string | null;
  sortOrder: number;
  _count: { items: number };
}

function CategoryRow({ cat, onEdit, onDelete }: { cat: CategoryType; onEdit: (c: CategoryType) => void; onDelete: (c: CategoryType) => void }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{cat.name}</TableCell>
      <TableCell><Badge variant="outline">{CATEGORY_LABELS[cat.category as Category] || cat.category}</Badge></TableCell>
      <TableCell>{cat._count.items}</TableCell>
      <TableCell>
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
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectModalOpen, setSelectModalOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryType | null>(null);
  const [filterType, setFilterType] = useState<string>("ALL");
  const [form, setForm] = useState({ name: "", category: "CON" as string, description: "" });
  const [deleteTarget, setDeleteTarget] = useState<CategoryType | null>(null);

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

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  function openCreate() {
    setSelectModalOpen(true);
  }

  function openEdit(cat: CategoryType) {
    setEditing(cat);
    setForm({ name: cat.name, category: cat.category, description: cat.description || "" });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!editing) return;
    const payload = {
      name: form.name,
      category: form.category,
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

  const filtered = filterType === "ALL" ? categories : categories.filter((c) => c.category === filterType);

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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Select value={filterType} onValueChange={(v) => setFilterType(v ?? "ALL")}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="ทุกประเภท" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">ทุกประเภท</SelectItem>
            <SelectItem value="KRU">ครุภัณฑ์</SelectItem>
            <SelectItem value="ELE">อิเล็กทรอนิกส์</SelectItem>
            <SelectItem value="BOOK">หนังสือ</SelectItem>
            <SelectItem value="TOY">ของเล่น</SelectItem>
            <SelectItem value="DUR">วัสดุคงทน</SelectItem>
            <SelectItem value="CON">วัสดุสิ้นเปลือง</SelectItem>
            <SelectItem value="MED">ยา</SelectItem>
            <SelectItem value="KIT">ชุด</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />เพิ่ม</Button>
      </div>

      <div className="rounded-2xl border overflow-hidden bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="sticky top-0 z-10 bg-card border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              <TableHead>ชื่อหมวดหมู่</TableHead>
              <TableHead>ประเภท</TableHead>
              <TableHead>จำนวน</TableHead>
              <TableHead className="w-[100px]">การดำเนินการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-12">
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "แก้ไขหมวดหมู่" : "เพิ่มหมวดหมู่"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cat-name">ชื่อหมวดหมู่</Label>
              <Input id="cat-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="cat-type">ประเภท</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v! })}>
                <SelectTrigger><SelectValue>{CATEGORY_LABELS[form.category as Category] || form.category}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="KRU">ครุภัณฑ์</SelectItem>
                  <SelectItem value="ELE">ครุภัณฑ์อิเล็กทรอนิกส์</SelectItem>
                  <SelectItem value="BOOK">หนังสือ</SelectItem>
                  <SelectItem value="TOY">ของเล่น/อุปกรณ์การศึกษา</SelectItem>
                  <SelectItem value="DUR">คงทน</SelectItem>
                  <SelectItem value="CON">สิ้นเปลือง</SelectItem>
                  <SelectItem value="MED">เวชภัณฑ์</SelectItem>
                  <SelectItem value="KIT">ชุดวัสดุ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cat-desc">รายละเอียด</Label>
              <Textarea id="cat-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={!form.name}>{editing ? "บันทึก" : "สร้าง"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
      />
    </div>
  );
}
