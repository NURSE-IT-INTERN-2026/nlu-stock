"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

interface CategoryType {
  id: string;
  name: string;
  category: string;
  description: string | null;
  sortOrder: number;
  _count: { items: number };
}

const CATEGORY_LABELS: Record<string, string> = {
  KRU: "ครุภัณฑ์",
  ELE: "ครุภัณฑ์อิเล็กทรอนิกส์",
  BOOK: "หนังสือ",
  TOY: "ของเล่น/อุปกรณ์การศึกษา",
  DUR: "คงทน",
  CON: "สิ้นเปลือง",
  MED: "เวชภัณฑ์",
  KIT: "ชุดวัสดุ",
};

function SortableRow({ cat, onEdit, onDelete }: { cat: CategoryType; onEdit: (c: CategoryType) => void; onDelete: (c: CategoryType) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-[40px]">
        <button className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground" {...attributes} {...listeners}>
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
      <TableCell className="font-medium">{cat.name}</TableCell>
      <TableCell><Badge variant="outline">{CATEGORY_LABELS[cat.category] || cat.category}</Badge></TableCell>
      <TableCell>{cat._count.items}</TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => onEdit(cat)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(cat)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function CategoriesTab() {
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryType | null>(null);
  const [form, setForm] = useState({ name: "", category: "CON" as string, description: "" });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/settings/categories");
    const data = await res.json();
    setCategories(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", category: "CON", description: "" });
    setDialogOpen(true);
  }

  function openEdit(cat: CategoryType) {
    setEditing(cat);
    setForm({ name: cat.name, category: cat.category, description: cat.description || "" });
    setDialogOpen(true);
  }

  async function handleSave() {
    const payload = { name: form.name, category: form.category, description: form.description || undefined };

    if (editing) {
      const res = await fetch(`/api/settings/categories/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const err = await res.json(); toast.error(err.error || "Failed to update"); return; }
      toast.success("Category updated");
    } else {
      const res = await fetch("/api/settings/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const err = await res.json(); toast.error(err.error || "Failed to create"); return; }
      toast.success("Category created");
    }
    setDialogOpen(false);
    fetchCategories();
  }

  async function handleDelete(cat: CategoryType) {
    if (!confirm(`Delete "${cat.name}"?`)) return;
    const res = await fetch(`/api/settings/categories/${cat.id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); toast.error(err.error || "Failed to delete"); return; }
    toast.success("Category deleted");
    fetchCategories();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(categories, oldIndex, newIndex);
    setCategories(reordered);

    const updates = reordered.map((c, i) => fetch(`/api/settings/categories/${c.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sortOrder: i + 1 }),
    }));
    await Promise.all(updates);
  }

  if (loading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Categories</h3>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]" />
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No categories</TableCell></TableRow>
                ) : categories.map((cat) => (
                  <SortableRow key={cat.id} cat={cat} onEdit={openEdit} onDelete={handleDelete} />
                ))}
              </TableBody>
            </Table>
          </div>
        </SortableContext>
      </DndContext>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v! })}>
                <SelectTrigger><SelectValue>{CATEGORY_LABELS[form.category] || form.category}</SelectValue></SelectTrigger>
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
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name}>{editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
