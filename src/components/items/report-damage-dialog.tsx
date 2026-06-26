"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { TriangleAlert, X } from "lucide-react";
import { FileUpload } from "@/components/shared/file-upload";
import { DAMAGE_STATUS_OPTIONS, STATUS_LABELS } from "@/lib/constants";
import { updateItemStatus } from "@/lib/api";

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

  function reset() {
    setNewStatus("");
    setSubItemId("");
    setNotes("");
    setImageUrl(null);
  }

  async function handleSave() {
    if (!newStatus) return;
    if (trackIndividually && !subItemId) {
      toast.error("กรุณาเลือกชิ้นย่อย");
      return;
    }
    setSaving(true);
    try {
      await updateItemStatus(itemId, {
        newStatus,
        subItemId: trackIndividually ? subItemId : null,
        notes: notes || null,
        imageUrl: imageUrl || null,
      });
      toast.success("อัปเดตสถานะแล้ว");
      onOpenChange(false);
      reset();
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "แจ้งไม่สำเร็จ");
    }
    setSaving(false);
  }

  const selectedSub = subItems.find((s) => s.id === subItemId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg gap-0 overflow-hidden p-0 sm:rounded-2xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">แจ้งชำรุด / สูญหาย</DialogTitle>
        <DialogDescription className="sr-only">
          ฟอร์มรายงานสถานะพัสดุ
        </DialogDescription>

        <div className="flex max-h-[85vh] flex-col overflow-hidden">
          {/* ── Header ── */}
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <TriangleAlert className="h-4 w-4" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">แจ้งชำรุด / สูญหาย</p>
                <p className="text-xs text-muted-foreground">รายงานสถานะพัสดุ</p>
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              aria-label="ปิด"
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 overflow-y-auto bg-secondary/40 px-6 py-6 space-y-5">
            {trackIndividually && (
              <div className="space-y-2">
                <Label>ชิ้นย่อย <span className="text-destructive">*</span></Label>
                <Select value={subItemId} onValueChange={(v) => setSubItemId(v ?? "")}>
                  <SelectTrigger className="bg-card w-full">
                    <span className={subItemId ? "text-foreground" : "text-muted-foreground"}>
                      {selectedSub
                        ? `${selectedSub.subCode} (${STATUS_LABELS[selectedSub.status] ?? selectedSub.status})`
                        : "เลือกชิ้นย่อย"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {subItems.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.subCode} ({STATUS_LABELS[sub.status] ?? sub.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>สถานะใหม่ <span className="text-destructive">*</span></Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v ?? "")}>
                <SelectTrigger className="bg-card w-full">
                  <span className={newStatus ? "text-foreground" : "text-muted-foreground"}>
                    {newStatus ? (STATUS_LABELS[newStatus] ?? newStatus) : "เลือกสถานะ"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {DAMAGE_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{STATUS_LABELS[s.value] ?? s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>หมายเหตุ</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="อธิบายรายละเอียด..."
                rows={3}
                className="bg-card"
              />
            </div>

            <div className="space-y-2">
              <Label>รูปหลักฐาน</Label>
              <FileUpload
                value={imageUrl}
                onChange={setImageUrl}
                accept="image/*"
                label="Upload Photo"
              />
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button
              variant="destructive"
              onClick={handleSave}
              disabled={saving || !newStatus || (trackIndividually && !subItemId)}
              className="gap-1.5"
            >
              {saving ? "กำลังบันทึก..." : "แจ้ง"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
