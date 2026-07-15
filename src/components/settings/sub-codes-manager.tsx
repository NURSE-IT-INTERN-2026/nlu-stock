"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { getSubItems, createSubItem, updateSubItem, deleteSubItem } from "@/lib/api";
import { formatSubCode, STATUS_LABELS, CONDITION_LABELS, labelFor, MANUAL_SETTABLE_STATUS_OPTIONS } from "@/lib/constants";

interface SubItemRecord {
  id: string;
  subCode: string;
  name: string | null;
  status: string;
  condition: string | null;
  serialNumber: string | null;
  notes: string | null;
}

interface SubCodesManagerProps {
  itemId: string;
  itemCode: string;
}

export function SubCodesManager({ itemId, itemCode }: SubCodesManagerProps) {
  const [subItems, setSubItems] = useState<SubItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SubItemRecord | null>(null);
  const [editForm, setEditForm] = useState({ subCode: "", name: "", status: "AVAILABLE", condition: "", serialNumber: "", notes: "" });
  const [batchForm, setBatchForm] = useState({ prefix: `${itemCode}-`, startNumber: 1, endNumber: 10 });

  const fetchSubItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSubItems(itemId);
      setSubItems(data as SubItemRecord[]);
    } catch {
      toast.error("โหลดหน่วยย่อยไม่สำเร็จ");
    }
    setLoading(false);
  }, [itemId]);

  useEffect(() => { fetchSubItems(); }, [fetchSubItems]);

  function openCreate() {
    setEditing(null);
    setEditForm({ subCode: "", name: "", status: "AVAILABLE", condition: "", serialNumber: "", notes: "" });
    setEditDialogOpen(true);
  }

  function openEdit(sub: SubItemRecord) {
    setEditing(sub);
    setEditForm({ subCode: sub.subCode, name: sub.name || "", status: sub.status, condition: sub.condition || "", serialNumber: sub.serialNumber || "", notes: sub.notes || "" });
    setEditDialogOpen(true);
  }

  async function handleSave() {
    try {
      if (editing) {
        await updateSubItem(editing.id, {
          status: editForm.status,
          name: editForm.name || null,
          condition: editForm.condition || null,
          serialNumber: editForm.serialNumber || null,
          notes: editForm.notes || null,
        });
        toast.success("แก้ไขหน่วยย่อยแล้ว");
      } else {
        await createSubItem(itemId, {
          subCode: editForm.subCode,
          name: editForm.name || null,
          status: editForm.status,
          condition: editForm.condition || null,
          serialNumber: editForm.serialNumber || null,
          notes: editForm.notes || null,
        });
        toast.success("เพิ่มหน่วยย่อยแล้ว");
      }
      setEditDialogOpen(false);
      fetchSubItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function handleBatchCreate() {
    try {
      const data = await createSubItem(itemId, batchForm) as { created: number };
      toast.success(`สร้าง ${data.created} หน่วยย่อย`);
      setBatchDialogOpen(false);
      fetchSubItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "สร้างหน่วยย่อยไม่สำเร็จ");
    }
  }

  async function handleDelete(sub: SubItemRecord) {
    if (!confirm(`ลบ "${sub.name || formatSubCode(itemCode, sub.subCode)}"?`)) return;
    try {
      await deleteSubItem(sub.id);
      toast.success("ลบหน่วยย่อยแล้ว");
      fetchSubItems();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบหน่วยย่อยไม่สำเร็จ");
    }
  }

  if (loading) return <div className="text-muted-foreground text-sm p-4">Loading sub-codes...</div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium">Sub-codes ({subItems.length})</h4>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setBatchDialogOpen(true)}>
            <Hash className="h-3.5 w-3.5 mr-1" />Batch Generate
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add
          </Button>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="[&>th]:h-8 [&>th]:py-0 [&>th]:text-xs [&>th]:text-muted-foreground">
              <TableHead className="w-36 px-2">Sub-code</TableHead>
              <TableHead className="px-2">Name</TableHead>
              <TableHead className="w-28 px-2">Status</TableHead>
              <TableHead className="w-32 px-2">Condition</TableHead>
              <TableHead className="w-40 px-2">Serial No.</TableHead>
              <TableHead className="w-40 px-2">Notes</TableHead>
              <TableHead className="w-[80px] px-2">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subItems.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-4 text-sm">No sub-codes</TableCell></TableRow>
            ) : subItems.map((sub) => (
              <TableRow key={sub.id} className="h-9 [&>td]:py-1">
                <TableCell className="font-mono text-xs px-2"><span className="block truncate">{formatSubCode(itemCode, sub.subCode)}</span></TableCell>
                <TableCell className="px-2"><span className="truncate min-w-0">{sub.name || "-"}</span></TableCell>
                <TableCell className="px-2">
                  <Badge variant={sub.status === "AVAILABLE" ? "default" : sub.status === "DAMAGED" ? "destructive" : "secondary"}>
                    {labelFor(STATUS_LABELS, sub.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs px-2">{sub.condition ? labelFor(CONDITION_LABELS, sub.condition) : "-"}</TableCell>
                <TableCell className="font-mono text-xs px-2"><span className="block truncate">{sub.serialNumber || "-"}</span></TableCell>
                <TableCell className="text-xs px-2"><span className="block truncate">{sub.notes || "-"}</span></TableCell>
                <TableCell className="px-2">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(sub)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(sub)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `แก้ไข ${editing.name || editing.subCode}` : "เพิ่มรหัสย่อย"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!editing && (
              <div>
                <Label>Sub-code</Label>
                <Input value={editForm.subCode} onChange={(e) => setEditForm({ ...editForm, subCode: e.target.value })} placeholder="e.g. ITM001-01" />
              </div>
            )}
            <div>
              <Label>Name</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="e.g. โต๊ะเขียนหนังสือ #1" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v ?? "AVAILABLE" })}>
                <SelectTrigger><SelectValue>{labelFor(STATUS_LABELS, editForm.status)}</SelectValue></SelectTrigger>
                <SelectContent>
                  {MANUAL_SETTABLE_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Condition</Label>
              <Input value={editForm.condition} onChange={(e) => setEditForm({ ...editForm, condition: e.target.value })} />
            </div>
            <div>
              <Label>Serial Number</Label>
              <Input value={editForm.serialNumber} onChange={(e) => setEditForm({ ...editForm, serialNumber: e.target.value })} placeholder="e.g. 12-6515-020-0001" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!editing && !editForm.subCode}>
              {editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Generate Dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batch Generate Sub-codes</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Prefix</Label>
              <Input value={batchForm.prefix} onChange={(e) => setBatchForm({ ...batchForm, prefix: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Number</Label>
                <Input type="number" value={batchForm.startNumber} onChange={(e) => setBatchForm({ ...batchForm, startNumber: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <Label>End Number</Label>
                <Input type="number" value={batchForm.endNumber} onChange={(e) => setBatchForm({ ...batchForm, endNumber: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <Separator />
            <p className="text-sm text-muted-foreground">
              Will generate {Math.max(0, batchForm.endNumber - batchForm.startNumber + 1)} sub-codes:
              {" "}{batchForm.prefix}{String(batchForm.startNumber).padStart(String(batchForm.endNumber).length, "0")} — {batchForm.prefix}{batchForm.endNumber}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleBatchCreate} disabled={batchForm.endNumber < batchForm.startNumber}>Generate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
