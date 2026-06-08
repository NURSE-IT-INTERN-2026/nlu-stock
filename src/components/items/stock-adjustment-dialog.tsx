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
import { FileUpload } from "@/components/shared/file-upload";
import { ADJUSTMENT_REASON_OPTIONS } from "@/lib/constants";
import { adjustStock } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  availableQty: number;
  totalQty: number;
  checkedOutCount: number;
  onSuccess: () => void;
}

export function StockAdjustmentDialog({ open, onOpenChange, itemId, availableQty, totalQty, checkedOutCount, onSuccess }: Props) {
  const [shelfCount, setShelfCount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [imageEvidence, setImageEvidence] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsedShelf = shelfCount !== "" ? parseInt(shelfCount) : null;
  const safeParsed = parsedShelf !== null && !isNaN(parsedShelf) ? parsedShelf : null;
  const newAvailable = safeParsed ?? 0;
  const newTotal = safeParsed !== null ? safeParsed + checkedOutCount : null;

  async function handleSave() {
    if (safeParsed === null || !reason) return;
    setSaving(true);
    try {
      await adjustStock(itemId, { shelfCount: safeParsed, reason, notes: notes || null, imageEvidence: imageEvidence || null });
      toast.success("Stock adjusted");
      onOpenChange(false);
      setShelfCount("");
      setReason("");
      setNotes("");
      setImageEvidence(null);
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to adjust stock");
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
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Total (system)</span>
              <p className="font-medium">{totalQty}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Currently checked out</span>
              <p className="font-medium">{checkedOutCount}</p>
            </div>
          </div>
          <div>
            <Label>Count on shelf *</Label>
            <Input
              type="number"
              min="0"
              value={shelfCount}
              onChange={(e) => setShelfCount(e.target.value)}
              placeholder="How many items did you count?"
            />
            {safeParsed !== null && newTotal !== null && (
              <p className={`text-sm mt-1 ${newTotal > totalQty ? "text-green-600" : newTotal < totalQty ? "text-destructive" : "text-muted-foreground"}`}>
                New total: {newTotal} ({newTotal > totalQty ? `+${newTotal - totalQty}` : newTotal < totalQty ? `${newTotal - totalQty}` : "no change"})
                {checkedOutCount > 0 && ` = ${safeParsed} on shelf + ${checkedOutCount} checked out`}
              </p>
            )}
          </div>
          <div>
            <Label>Reason *</Label>
            <Select value={reason} onValueChange={(v) => setReason(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_REASON_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." />
          </div>
          <div>
            <Label>Evidence Photo</Label>
            <FileUpload
              value={imageEvidence}
              onChange={setImageEvidence}
              accept="image/*"
              label="Upload Photo"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || safeParsed === null || !reason}>
            {saving ? "Saving..." : "Adjust"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
