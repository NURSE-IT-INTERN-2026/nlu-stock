"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DIALOG_SHELL,
  DIALOG_BODY,
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";
import { FileUpload } from "@/components/shared/file-upload";
import { STATUS_LABELS, effectiveCode, type ItemStatus } from "@/lib/constants";
import { updateItemStatus } from "@/lib/api";

interface SubItemOption {
  id: string;
  subCode: string;
  name?: string | null;
  status: ItemStatus;
}

const STATUS_ACTION_META: Record<string, { title: string; desc: string; submit: string; placeholder: string }> = {
  AVAILABLE: { title: "กลับพร้อมใช้งาน", desc: "ล้างสถานะชำรุด/ส่งซ่อม/ตัดจำหน่าย กลับมาใช้งานได้", submit: "ยืนยันพร้อมใช้งาน", placeholder: "เช่น ซ่อมเสร็จแล้ว..." },
  DAMAGED: { title: "แจ้งชำรุด", desc: "เปลี่ยนสถานะพัสดุเป็นชำรุด", submit: "แจ้งชำรุด", placeholder: "อธิบายรายละเอียดการชำรุด..." },
  LOST: { title: "แจ้งสูญหาย", desc: "บันทึกพัสดุสูญหาย", submit: "ยืนยันสูญหาย", placeholder: "อธิบายสาเหตุการสูญหาย..." },
  DISPOSED: { title: "ตัดจำหน่าย", desc: "ตัดพัสดุนี้ออกจากระบบ", submit: "ยืนยันตัดจำหน่าย", placeholder: "เหตุผลในการตัดจำหน่าย..." },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemCode?: string;
  /** Status to apply. AVAILABLE = clear a manual off-normal status. */
  status: "AVAILABLE" | "DAMAGED" | "LOST" | "DISPOSED";
  trackIndividually: boolean;
  subItems: SubItemOption[];
  onSuccess: () => void;
}

export function ReportStatusDialog({ open, onOpenChange, itemId, itemCode, status, trackIndividually, subItems, onSuccess }: Props) {
  const meta = STATUS_ACTION_META[status];
  // Lost/disposed reports must carry a reason — bookkeeping needs the why.
  const notesRequired = status === "LOST" || status === "DISPOSED";
  // Full sub-code shown to staff (e.g. NLU-KRU-001-C01); falls back to raw when no itemCode.
  const fmtCode = (code: string) => effectiveCode(itemCode ?? "", code, subItems.length);
  // ponytail: name optional — most sub-items have one, code stays as the ID.
  const subLabel = (sub: SubItemOption) =>
    `${sub.name ? `${sub.name} · ` : ""}${fmtCode(sub.subCode)} (${STATUS_LABELS[sub.status] ?? sub.status})`;
  const [subItemId, setSubItemId] = useState("");
  const [notes, setNotes] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // When there is exactly one sub-item (e.g. opened from a specific piece's detail
  // page), auto-select it and skip the picker — no need to choose from a list.
  const lockedSub = trackIndividually && subItems.length === 1 ? subItems[0] : null;
  useEffect(() => {
    if (open && lockedSub) setSubItemId(lockedSub.id);
  }, [open, lockedSub?.id]);

  function reset() {
    setSubItemId("");
    setNotes("");
    setImageUrl(null);
  }

  async function handleSave() {
    if (trackIndividually && !subItemId) {
      toast.error("กรุณาเลือกชิ้นย่อย");
      return;
    }
    if (notesRequired && !notes.trim()) {
      toast.error("กรุณากรอกหมายเหตุ");
      return;
    }
    setSaving(true);
    try {
      await updateItemStatus(itemId, {
        newStatus: status,
        subItemId: trackIndividually ? subItemId : null,
        notes: notes || null,
        imageUrl: imageUrl || null,
      });
      toast.success(`${meta.title}แล้ว`);
      onOpenChange(false);
      reset();
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
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
        <DialogTitle className="sr-only">{meta.title}</DialogTitle>
        <DialogDescription className="sr-only">{meta.desc}</DialogDescription>

        <div className={DIALOG_SHELL}>
          {/* ── Header ── */}
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-4">
            <div className="flex items-center gap-3">
              <div className={status === "AVAILABLE"
                ? "flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success"
                : "flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive"}>
                {status === "AVAILABLE" ? <CheckCircle2 className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">{meta.title}</p>
                <p className="text-xs text-muted-foreground">{meta.desc}</p>
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
          <div className={cn(DIALOG_BODY, "bg-secondary/40 px-6 py-6 space-y-5")}>
            {trackIndividually && (
              <div className="space-y-2">
                <Label>ชิ้นย่อย{!lockedSub && <span className="text-destructive"> *</span>}</Label>
                {lockedSub ? (
                  <div className="rounded-md border bg-card px-3 py-2 text-sm font-medium text-gray-900">
                    {subLabel(lockedSub)}
                  </div>
                ) : (
                  <Select value={subItemId} onValueChange={(v) => setSubItemId(v ?? "")}>
                    <SelectTrigger className="bg-card w-full">
                      <span className={subItemId ? "text-foreground" : "text-muted-foreground"}>
                        {selectedSub
                          ? subLabel(selectedSub)
                          : "เลือกชิ้นย่อย"}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {subItems.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          {subLabel(sub)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label required={notesRequired}>หมายเหตุ</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={meta.placeholder}
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
                label="อัปโหลดรูปภาพ"
              />
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button
              variant={status === "AVAILABLE" ? "default" : "destructive"}
              onClick={handleSave}
              disabled={saving || (trackIndividually && !subItemId) || (notesRequired && !notes.trim())}
              className="gap-1.5"
            >
              {saving ? "กำลังบันทึก..." : meta.submit}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
