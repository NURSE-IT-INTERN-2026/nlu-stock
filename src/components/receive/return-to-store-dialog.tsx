"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Loader2, PackageCheck, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DIALOG_SHELL, DIALOG_BODY, Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LocationCascadePicker, type LocationRef, resolveLocationId } from "@/components/shared/location-cascade-picker";
import { locationLabel } from "@/lib/constants";
import { toast } from "sonner";
import { returnInUseRecord, type InUseRecord } from "@/lib/api";

/**
 * คืนเข้าคลัง for one นำไปใช้งาน record — and the place it goes back to is a choice.
 *
 * นำไปใช้งาน overwrote where this stock lives on the way out, so the system genuinely does
 * not know where it belongs now; asking is the only honest option. The picker is seeded
 * with the item's registered location, which makes the ordinary case (it really is going
 * back to the storeroom) a single click. That default matters: a dialog that demands input
 * nobody wants to give is how the existing records ended up stationed in rooms called
 * "asad" and "mnmn".
 *
 * Picking anywhere else is a move, not a homecoming — the API closes this record and opens
 * a fresh นำไปใช้งาน one at the destination, so the stock stays accounted for by a record
 * rather than dissolving into an available total with no room attached.
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

  const [locRef, setLocRef] = useState<LocationRef>({ kind: "none" });
  const [qty, setQty] = useState(outstanding);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const homeLabel = record.item.location ? locationLabel(record.item.location) : null;
  // Comparing labels, not ids: the picker hands back a descriptor and only resolves to an
  // id on submit, so this is what the notice can key off while the user is still choosing.
  const isMove = locRef.kind === "ok" && !!homeLabel && locRef.name !== homeLabel;

  const reset = () => { setLocRef({ kind: "none" }); setQty(outstanding); setNote(""); setShowErrors(false); };

  const locError = locRef.kind === "ok" ? null : "เลือกสถานที่จัดเก็บ";

  const handleSubmit = async () => {
    if (locRef.kind !== "ok") { setShowErrors(true); return; }
    setSubmitting(true);
    onSaving?.(true);
    try {
      const destLocationId = await resolveLocationId(locRef);
      if (!destLocationId) throw new Error("ไม่พบสถานที่ที่เลือก ลองใหม่อีกครั้ง");
      const res = await returnInUseRecord(record.id, {
        destLocationId,
        quantity: isTracked ? undefined : qty,
        note: note.trim() || null,
      });
      toast.success(
        res.moved
          ? `ย้าย "${record.item.name}" ไปที่ ${locRef.name} แล้ว`
          : `คืน "${record.item.name}" เข้าคลังแล้ว`,
      );
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
              <div className="space-y-2">
                <Label required>สถานที่จัดเก็บ</Label>
                <LocationCascadePicker
                  initialLocationId={record.item.locationId}
                  onChange={setLocRef}
                  restrictToExisting
                />
                {showErrors && locError && <FieldError>{locError}</FieldError>}
                {/* Says out loud that this isn't a homecoming, before it is confirmed —
                    the stock stays counted as ใช้งานอยู่, just in a different room. */}
                {isMove && (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <ArrowRight className="size-3.5 shrink-0 mt-px text-primary" />
                    ไม่ใช่ที่ตั้งตามทะเบียน — บันทึกเป็นการย้ายไปตั้งใช้งานที่ {locRef.name} (ยังไม่นับเป็นของว่าง)
                  </p>
                )}
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
              {isMove ? "ย้ายที่ตั้ง" : "คืนเข้าคลัง"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return <p role="alert" className="text-xs text-destructive">{children}</p>;
}
