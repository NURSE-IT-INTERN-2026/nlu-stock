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

const STATUS_OPTIONS = [
  { value: "DAMAGED", label: "Damaged" },
  { value: "UNDER_REPAIR", label: "Under Repair" },
  { value: "LOST", label: "Lost" },
  { value: "DISPOSED", label: "Disposed" },
];

interface SubItemOption {
  id: string;
  subCode: string;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  trackIndividually: boolean;
  subItems: SubItemOption[];
  onSuccess: () => void;
}

export function ReportDamageDialog({ open, onOpenChange, itemId, trackIndividually, subItems, onSuccess }: Props) {
  const [newStatus, setNewStatus] = useState("");
  const [subItemId, setSubItemId] = useState("");
  const [notes, setNotes] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!newStatus) return;
    if (trackIndividually && !subItemId) {
      toast.error("Please select a sub-item");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/items/${itemId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newStatus,
          subItemId: trackIndividually ? subItemId : null,
          notes: notes || null,
          imageUrl: imageUrl || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to report");
        return;
      }
      toast.success("Status updated");
      onOpenChange(false);
      setNewStatus("");
      setSubItemId("");
      setNotes("");
      setImageUrl(null);
      onSuccess();
    } catch {
      toast.error("Failed to report");
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report Damage / Lost</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {trackIndividually && (
            <div>
              <Label>Sub-item *</Label>
              <Select value={subItemId} onValueChange={(v) => setSubItemId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Select sub-item" /></SelectTrigger>
                <SelectContent>
                  {subItems.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.subCode} ({sub.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>New Status *</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Describe the issue..." />
          </div>
          <div>
            <Label>Evidence Photo</Label>
            <FileUpload
              value={imageUrl}
              onChange={setImageUrl}
              accept="image/*"
              label="Upload Photo"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleSave} disabled={saving || !newStatus || (trackIndividually && !subItemId)}>
            {saving ? "Saving..." : "Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
