"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Loader2, PackageCheck, X, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DIALOG_SHELL, DIALOG_BODY, Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { locationLabel } from "@/lib/constants";
import { toast } from "sonner";
import { returnInUseRecord, type InUseRecord } from "@/lib/api";

/**
 * คืนเข้าคลัง for one นำไปใช้งาน record — back to the item's สถานที่จัดเก็บ, shown, not asked.
 *
 * Don't add a destination picker: any other answer turns คืน into a move and the stock never
 * comes back ว่าง. ที่ตั้งหลักคือทะเบียนใน ตั้งค่า — คืนคือกลับบ้าน; taking it elsewhere is
 * ย้ายที่ตั้ง afterwards, on its own screen. The location is printed so whoever holds the thing
 * can see where it goes.
 */
export function ReturnToStoreDialog({
  open, onOpenChange, record, onSaving, onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  record: InUseRecord;
  onSaving?: (saving: boolean) => void;
  onSuccess?: () => void;
}) {
  const outstanding = record.quantity - record.resolvedQty;
  const isTracked = !!record.subItem;

  const [qty, setQty] = useState(outstanding);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const homeLabel = record.item.location ? locationLabel(record.item.location) : null;

  const reset = () => { setQty(outstanding); setNote(""); };

  const handleSubmit = async () => {
    setSubmitting(true);
    onSaving?.(true);
    try {
      await returnInUseRecord(record.id, {
        quantity: isTracked ? undefined : qty,
        note: note.trim() || null,
      });
      toast.success(`คืน "${record.item.name}" เข้าคลังแล้ว`);
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "คืนเข้าคลังไม่สำเร็จ");
    } finally {
      setSubmitting(false);
      onSaving?.(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent showCloseButton={false} className="max-w-[calc(100%-2rem)] sm:max-w-[460px] gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">คืนเข้าคลัง</DialogTitle>
        <DialogDescription className="sr-only">{record.item.code} · {record.item.name}</DialogDescription>

        <div className={DIALOG_SHELL}>
          {/* Header band */}
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <PackageCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-foreground">คืนเข้าคลัง</p>
                <p className="text-xs text-muted-foreground truncate">
                  <span className="font-mono">{record.item.code}</span> · {record.item.name}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className={cn(DIALOG_BODY, "bg-secondary/40 px-6 py-6")}>
            <fieldset disabled={submitting} className="m-0 min-w-0 space-y-5 border-0">
              {/* Where it goes back to, stated rather than chosen — see the note above.
                  Printed even when the item has no registered location, so a blank ทะเบียน
                  shows up here as something to fix instead of an empty row nobody notices. */}
              <div className="space-y-2">
                <Label>สถานที่จัดเก็บ</Label>
                <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
                  <MapPin className="size-4 shrink-0 mt-px text-primary" />
                  <span className={homeLabel ? "text-foreground" : "text-muted-foreground"}>
                    {homeLabel ?? "ยังไม่ได้ตั้งสถานที่จัดเก็บให้พัสดุนี้"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  คืนเข้าที่จัดเก็บตามทะเบียนเสมอ · ย้ายที่เก็บถาวรได้ที่หน้าพัสดุ
                </p>
              </div>

              {!isTracked && (
                <div className="space-y-2">
                  <Label htmlFor="return-qty" required>จำนวนที่คืน</Label>
                  <Input
                    id="return-qty"
                    type="number"
                    min={1}
                    max={outstanding}
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, Math.min(Number(e.target.value) || 1, outstanding)))}
                    className="bg-card"
                  />
                  <p className="text-xs text-muted-foreground">อยู่นอกคลัง {outstanding} {record.item.issueUnit.name}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="return-note">หมายเหตุ</Label>
                <Textarea
                  id="return-note"
                  placeholder="เช่น สภาพของ, ผู้ส่งคืน (ไม่บังคับ)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="bg-card"
                />
              </div>
            </fieldset>
          </div>

          {/* Footer band */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
            <Button variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button disabled={submitting} onClick={() => void handleSubmit()}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              คืนเข้าคลัง
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
