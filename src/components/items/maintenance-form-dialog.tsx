"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/shared/file-upload";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  onSuccess: () => void;
}

export function MaintenanceFormDialog({ open, onOpenChange, itemId, onSuccess }: Props) {
  const [type, setType] = useState<"PREVENTIVE" | "CORRECTIVE">("PREVENTIVE");
  const [result, setResult] = useState<"AVAILABLE" | "NEEDS_MORE_REPAIR" | "DISPOSED">("AVAILABLE");
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().split("T")[0]);
  const [issue, setIssue] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [nextMaintenanceAt, setNextMaintenanceAt] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/items/${itemId}/maintenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          result,
          performedAt,
          issue: issue || null,
          description: description || null,
          cost: cost ? parseFloat(cost) : null,
          nextMaintenanceAt: nextMaintenanceAt || null,
          attachmentUrls: attachmentUrl ? [attachmentUrl] : [],
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed");
      }
      toast.success("Maintenance record saved");
      resetAndClose();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setType("PREVENTIVE");
    setResult("AVAILABLE");
    setPerformedAt(new Date().toISOString().split("T")[0]);
    setIssue("");
    setDescription("");
    setCost("");
    setNextMaintenanceAt("");
    setAttachmentUrl(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Maintenance</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PREVENTIVE">ป้องกัน</SelectItem>
                  <SelectItem value="CORRECTIVE">ซ่อมแก้ไข</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Result</Label>
              <Select value={result} onValueChange={(v) => setResult(v as typeof result)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AVAILABLE">พร้อมใช้งาน</SelectItem>
                  <SelectItem value="NEEDS_MORE_REPAIR">ต้องซ่อมเพิ่ม</SelectItem>
                  <SelectItem value="DISPOSED">จำหน่าย</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Date Performed</Label>
            <Input type="date" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} />
          </div>

          {type === "CORRECTIVE" && (
            <div className="space-y-1.5">
              <Label>Issue</Label>
              <Input value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="What was wrong?" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Work performed..." rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cost (฿)</Label>
              <Input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Next Maintenance</Label>
              <Input type="date" value={nextMaintenanceAt} onChange={(e) => setNextMaintenanceAt(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Attachment</Label>
            <FileUpload
              value={attachmentUrl}
              onChange={setAttachmentUrl}
              accept="image/*,.pdf"
              label="Upload Attachment"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
            <Button disabled={submitting} onClick={handleSubmit}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
