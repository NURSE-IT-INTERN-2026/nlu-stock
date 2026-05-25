"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const ADJUSTMENT_REASONS = [
  { value: "LOST", label: "Lost" },
  { value: "DAMAGED_PENDING_REPAIR", label: "Damaged (pending repair)" },
  { value: "COUNT_MISMATCH", label: "Count mismatch" },
  { value: "DISPOSAL", label: "Disposal" },
  { value: "OTHER", label: "Other" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  currentQty: number;
  onSuccess: () => void;
}

export function StockAdjustmentDialog({ open, onOpenChange, itemId, currentQty, onSuccess }: Props) {
  const [newQty, setNewQty] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const diff = newQty !== "" ? parseInt(newQty) - currentQty : 0;

  async function handleSave() {
    if (newQty === "" || !reason) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/items/${itemId}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newQty: parseInt(newQty), reason, notes: notes || null }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to adjust stock");
        return;
      }
      toast.success("Stock adjusted");
      onOpenChange(false);
      setNewQty("");
      setReason("");
      setNotes("");
      onSuccess();
    } catch {
      toast.error("Failed to adjust stock");
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Current Quantity</Label>
            <Input value={currentQty} disabled />
          </div>
          <div>
            <Label>New Quantity</Label>
            <Input
              type="number"
              min="0"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              placeholder="Enter new quantity"
            />
            {newQty !== "" && (
              <p className={`text-sm mt-1 ${diff > 0 ? "text-green-600" : diff < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {diff > 0 ? `+${diff}` : diff} from current
              </p>
            )}
          </div>
          <div>
            <Label>Reason *</Label>
            <Select value={reason} onValueChange={(v) => setReason(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || newQty === "" || !reason}>
            {saving ? "Saving..." : "Adjust"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
