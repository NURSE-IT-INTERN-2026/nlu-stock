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
    const res = await fetch(`/api/settings/items/${itemId}/sub-items`);
    const data = await res.json();
    setSubItems(data);
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
    if (editing) {
      const res = await fetch(`/api/settings/sub-items/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: editForm.status,
          name: editForm.name || null,
          condition: editForm.condition || null,
          serialNumber: editForm.serialNumber || null,
          notes: editForm.notes || null,
        }),
      });
      if (!res.ok) { toast.error("Failed to update"); return; }
      toast.success("Sub-code updated");
    } else {
      const res = await fetch(`/api/settings/items/${itemId}/sub-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subCode: editForm.subCode,
          name: editForm.name || null,
          status: editForm.status,
          condition: editForm.condition || null,
          serialNumber: editForm.serialNumber || null,
          notes: editForm.notes || null,
        }),
      });
      if (!res.ok) { toast.error("Failed to create"); return; }
      toast.success("Sub-code created");
    }
    setEditDialogOpen(false);
    fetchSubItems();
  }

  async function handleBatchCreate() {
    const res = await fetch(`/api/settings/items/${itemId}/sub-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batchForm),
    });
    if (!res.ok) { toast.error("Failed to create sub-codes"); return; }
    const data = await res.json();
    toast.success(`Created ${data.created} sub-codes`);
    setBatchDialogOpen(false);
    fetchSubItems();
  }

  async function handleDelete(sub: SubItemRecord) {
    if (!confirm(`Delete "${sub.subCode}"?`)) return;
    const res = await fetch(`/api/settings/sub-items/${sub.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Failed to delete"); return; }
    toast.success("Sub-code deleted");
    fetchSubItems();
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sub-code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Serial No.</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subItems.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-4 text-sm">No sub-codes</TableCell></TableRow>
            ) : subItems.map((sub) => (
              <TableRow key={sub.id}>
                <TableCell className="font-mono text-sm">{sub.subCode}</TableCell>
                <TableCell className="text-sm">{sub.name || "-"}</TableCell>
                <TableCell>
                  <Badge variant={sub.status === "AVAILABLE" ? "default" : sub.status === "DAMAGED" ? "destructive" : "secondary"}>
                    {sub.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{sub.condition || "-"}</TableCell>
                <TableCell className="font-mono text-xs">{sub.serialNumber || "-"}</TableCell>
                <TableCell className="text-sm max-w-[200px] truncate">{sub.notes || "-"}</TableCell>
                <TableCell>
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
            <DialogTitle>{editing ? `Edit ${editing.subCode}` : "Add Sub-code"}</DialogTitle>
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AVAILABLE">Available</SelectItem>
                  <SelectItem value="CHECKED_OUT">Checked Out</SelectItem>
                  <SelectItem value="DAMAGED">Damaged</SelectItem>
                  <SelectItem value="UNDER_REPAIR">Under Repair</SelectItem>
                  <SelectItem value="LOST">Lost</SelectItem>
                  <SelectItem value="DISPOSED">Disposed</SelectItem>
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
