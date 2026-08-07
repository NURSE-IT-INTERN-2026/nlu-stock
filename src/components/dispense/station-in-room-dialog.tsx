"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Loader2, Home, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DIALOG_SHELL,
  DIALOG_BODY,
 Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LocationCascadePicker, type LocationRef, resolveLocationId } from "@/components/shared/location-cascade-picker";
import { toast } from "sonner";
import { createDispense } from "@/lib/api";

/**
 * "นำไปใช้งาน" (INUSE) action — places a durable somewhere, open-ended (no return).
 * - Tracked durable: pass `subItemId` → qty fixed 1 (one piece per action). The picked
 *   destination also becomes that piece's own SubItem.locationId (it really did move).
 * - COUNT durable: omit `subItemId`, pass `availableQty`/`issueUnit` → qty input. The
 *   item's home location (shelf) is untouched — each action is its own DispenseRecord,
 *   so 45 units can go to room A and the rest stay on the shelf; see ADR notes below.
 * Submits a single-item dispense with loanType INUSE, storing the picked Location's id on
 * DispenseRecord.locationId. The picker only offers locations already set up by an admin
 * (Settings → สถานที่) — staff can't create new ones from this dialog.
 */
export function StationInRoomDialog({
  open,
  onOpenChange,
  itemId,
  itemCode,
  itemName,
  subItemId,
  availableQty,
  issueUnit,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  itemId: string;
  itemCode: string;
  itemName: string;
  subItemId?: string;
  availableQty?: number;
  issueUnit?: string;
  onSuccess?: () => void;
}) {
  const isTracked = !!subItemId;
  const fieldCls = "bg-card";
  const [locRef, setLocRef] = useState<LocationRef>({ kind: "none" });
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const reset = () => {
    setLocRef({ kind: "none" }); setNotes(""); setQty(1); setShowErrors(false);
  };

  // Only the destination is required; หมายเหตุ is optional context.
  const locError = locRef.kind === "ok" ? null : "เลือกสถานที่ที่นำไปใช้งาน";
  const canConfirm = !locError;

  const handleSubmit = async () => {
    if (!canConfirm || locRef.kind !== "ok") {
      setShowErrors(true);
      return;
    }
    setSubmitting(true);
    try {
      // No .catch(() => null): a record that can't name its room is stock we've lost.
      // The API refuses it too — this just fails the click instead of the request.
      const locationId = await resolveLocationId(locRef);
      if (!locationId) throw new Error("ไม่พบสถานที่ที่เลือก ลองใหม่อีกครั้ง");
      await createDispense({
        items: [{ itemId, subItemId: subItemId ?? null, quantity: isTracked ? 1 : qty }],
        notes: notes.trim() || null,
        locationId,
        dueAt: null, // INUSE: open-ended, no return date
        loanType: "INUSE",
      });
      toast.success(`นำ "${itemName}" ไปใช้งานที่ ${locRef.name} แล้ว`);
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "นำไปใช้งานไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}
    >
      <DialogContent showCloseButton={false} className="max-w-[calc(100%-2rem)] sm:max-w-[460px] gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">นำไปใช้งาน</DialogTitle>
        <DialogDescription className="sr-only">{itemCode} · {itemName}</DialogDescription>

        {/* Height is capped here, not on DialogContent: header/footer stay put and only the
            body scrolls, so the dialog never grows past the viewport on a short screen. */}
        <div className={DIALOG_SHELL}>
        {/* Header band */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Home className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold text-foreground">นำไปใช้งาน</p>
              <p className="text-xs text-muted-foreground truncate"><span className="font-mono">{itemCode}</span> · {itemName}</p>
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
              <Label required>สถานที่ที่นำไปใช้งาน</Label>
              <LocationCascadePicker initialLocationId={null} onChange={setLocRef} restrictToExisting />
              {showErrors && locError && <FieldError>{locError}</FieldError>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="station-notes">หมายเหตุ</Label>
              <Textarea id="station-notes" placeholder="เช่น ผู้ดูแล, กิจกรรมที่นำไปใช้ (ไม่บังคับ)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={fieldCls} />
            </div>

            {!isTracked && (
              <div className="space-y-2">
                <Label htmlFor="station-qty" required>จำนวน</Label>
                <Input
                  id="station-qty"
                  type="number"
                  min={1}
                  max={availableQty}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Math.min(Number(e.target.value) || 1, availableQty ?? 1)))}
                  className={fieldCls}
                />
                <p className="text-xs text-muted-foreground">เหลือ {availableQty} {issueUnit}</p>
              </div>
            )}
          </fieldset>
        </div>

        {/* Footer band */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
          <Button variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            ยืนยัน
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
