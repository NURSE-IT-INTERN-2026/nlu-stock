"use client";

import { useState, useEffect } from "react";
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

export interface AdjustLot {
  id: string;
  lotNumber: string;
  remainingQty: number;
  expiryDate?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  availableQty: number;
  totalQty: number;
  checkedOutCount: number;
  /** If provided and non-empty, the dialog corrects a specific lot (consumable). */
  lots?: AdjustLot[];
  onSuccess: () => void;
}

export function StockAdjustmentDialog({ open, onOpenChange, itemId, availableQty, totalQty, checkedOutCount, lots, onSuccess }: Props) {
  const lotMode = !!lots && lots.length > 0;
  const [selectedLotId, setSelectedLotId] = useState("");
  const [count, setCount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [imageEvidence, setImageEvidence] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Default-select the first lot when entering lot mode
  useEffect(() => {
    if (open && lotMode && lots && !selectedLotId) setSelectedLotId(lots[0]?.id ?? "");
    if (!open) { setCount(""); setReason(""); setNotes(""); setImageEvidence(null); }
  }, [open, lotMode, lots, selectedLotId]);

  const parsed = count !== "" ? parseInt(count) : null;
  const safe = parsed !== null && !isNaN(parsed) ? parsed : null;
  const selectedLot = lotMode ? lots?.find((l) => l.id === selectedLotId) : null;
  const lotPrev = selectedLot?.remainingQty ?? 0;

  // New item-level totals for preview
  const newAvailable = lotMode
    ? (safe !== null ? availableQty - lotPrev + safe : availableQty)
    : (safe ?? 0);
  const newTotal = lotMode ? null : (safe !== null ? safe + checkedOutCount : null);

  async function handleSave() {
    if (safe === null || !reason) return;
    if (lotMode && !selectedLotId) return;
    setSaving(true);
    try {
      if (lotMode) {
        await adjustStock(itemId, { lotId: selectedLotId, lotCount: safe, reason, notes: notes || null, imageEvidence: imageEvidence || null });
      } else {
        await adjustStock(itemId, { shelfCount: safe, reason, notes: notes || null, imageEvidence: imageEvidence || null });
      }
      toast.success(lotMode ? "Lot adjusted" : "Stock adjusted");
      onOpenChange(false);
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to adjust stock");
    }
    setSaving(false);
  }

  const noChange = lotMode ? safe === lotPrev : safe !== null && newTotal !== null && newTotal === totalQty;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lotMode ? "แก้ยอด Lot" : "Adjust Stock"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Lot picker — consumable mode */}
          {lotMode && (
            <div>
              <Label>Lot *</Label>
              <Select value={selectedLotId} onValueChange={(v) => { if (v) setSelectedLotId(v); }}>
                <SelectTrigger><SelectValue placeholder="เลือก lot" /></SelectTrigger>
                <SelectContent>
                  {lots!.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.lotNumber} — เหลือ {l.remainingQty}
                      {l.expiryDate ? ` (หมดอายุ ${new Date(l.expiryDate).toLocaleDateString()})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            {lotMode ? (
              <>
                <div>
                  <span className="text-muted-foreground">Lot คงเหลือ (ระบบ)</span>
                  <p className="font-medium">{lotPrev}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">รวมทั้งหมด (available)</span>
                  <p className="font-medium">{availableQty}</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-muted-foreground">Total (system)</span>
                  <p className="font-medium">{totalQty}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Currently checked out</span>
                  <p className="font-medium">{checkedOutCount}</p>
                </div>
              </>
            )}
          </div>

          <div>
            <Label>{lotMode ? "นับจริงได้กี่ชิ้น (lot นี้) *" : "Count on shelf *"}</Label>
            <Input
              type="number"
              min="0"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              placeholder={lotMode ? "จำนวนจริงของ lot นี้" : "How many items did you count?"}
            />
            {safe !== null && (
              <p className={`text-sm mt-1 ${noChange ? "text-muted-foreground" : (lotMode ? (safe > lotPrev ? "text-green-600" : "text-destructive") : (newTotal! > totalQty ? "text-green-600" : "text-destructive"))}`}>
                {lotMode
                  ? `Lot: ${lotPrev} → ${safe} (${safe >= lotPrev ? "+" : ""}${safe - lotPrev})`
                  : `New total: ${newTotal} (${newTotal! > totalQty ? `+${newTotal! - totalQty}` : `${newTotal! - totalQty}`})`}
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
          <Button onClick={handleSave} disabled={saving || safe === null || !reason || (lotMode && !selectedLotId)}>
            {saving ? "Saving..." : "Adjust"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
