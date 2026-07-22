"use client";

import { useState, type ReactNode } from "react";
import { Loader2, Home, X } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { USAGE_TYPE_OPTIONS } from "@/lib/constants";
import { createDispense } from "@/lib/api";

/**
 * "ตั้งใช้ในห้อง" (INUSE) action — places a durable in a room, open-ended (no return).
 * - Tracked durable: pass `subItemId` → qty fixed 1 (one piece per action).
 * - COUNT durable: omit `subItemId`, pass `availableQty`/`issueUnit` → qty input.
 * Submits a single-item dispense with loanType INUSE; /api/dispense flips the sub-item
 * to IN_USE (tracked) or decrements availableQty (COUNT). room is folded into notes.
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
  const [usageType, setUsageType] = useState("");
  const [usageNote, setUsageNote] = useState("");
  const [recipient, setRecipient] = useState("");
  const [room, setRoom] = useState("");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const reset = () => {
    setUsageType(""); setUsageNote(""); setRecipient(""); setRoom(""); setNotes("");
    setQty(1); setShowErrors(false);
  };

  // usageType + recipient + room required (qty bounded by the input max).
  const errors = {
    usageType: usageType ? null : "เลือกการใช้งาน",
    recipient: recipient.trim() ? null : "ระบุผู้รับ",
    room: room.trim() ? null : "ระบุห้องที่นำไปตั้ง",
  } as Record<string, string | null>;
  const canConfirm = Object.values(errors).every((v) => !v);

  const handleSubmit = async () => {
    if (!canConfirm) {
      setShowErrors(true);
      const firstErrorKey = Object.keys(errors).find((k) => errors[k]);
      if (firstErrorKey) document.getElementById(`station-${firstErrorKey}`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await createDispense({
        items: [{ itemId, subItemId: subItemId ?? null, quantity: isTracked ? 1 : qty }],
        usageType: usageType || null,
        usageNote: usageType === "OTHER" ? usageNote || null : null,
        notes: [notes.trim(), room.trim() && `ห้องที่ตั้ง: ${room.trim()}`].filter(Boolean).join(" | ") || null,
        recipient: recipient || null,
        dueAt: null, // INUSE: open-ended, no return date
        loanType: "INUSE",
      });
      toast.success(`ตั้ง "${itemName}" ใช้ในห้องแล้ว`);
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ตั้งใช้ในห้องไม่สำเร็จ");
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

        {/* Header band */}
        <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
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
        <div className="bg-secondary/40 px-6 py-6">
          <fieldset disabled={submitting} className="m-0 min-w-0 space-y-5 border-0">
            <div className="space-y-2">
              <Label htmlFor="station-usageType" required>ใช้ใน</Label>
              <Select value={usageType} onValueChange={(v) => v !== null && setUsageType(v)}>
                <SelectTrigger id="station-usageType" aria-required="true" aria-invalid={showErrors && !!errors.usageType} className={`${fieldCls} w-full`}>
                  <SelectValue placeholder="เลือกการใช้งาน">{USAGE_TYPE_OPTIONS.find((o) => o.value === usageType)?.label ?? "เลือกการใช้งาน"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {USAGE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {showErrors && errors.usageType && <FieldError>{errors.usageType}</FieldError>}
            </div>

            {usageType === "OTHER" && (
              <div className="space-y-2">
                <Label htmlFor="station-usageNote">ระบุการใช้งาน</Label>
                <Input id="station-usageNote" placeholder="ระบุการใช้งาน..." value={usageNote} onChange={(e) => setUsageNote(e.target.value)} className={fieldCls} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="station-recipient" required>ผู้รับ</Label>
              <Input
                id="station-recipient"
                required
                aria-invalid={showErrors && !!errors.recipient}
                placeholder="ใครดูแล เช่น ครูสมชาย / ห้อง ม.4/1"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className={fieldCls}
              />
              {showErrors && errors.recipient && <FieldError>{errors.recipient}</FieldError>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="station-room" required>ห้องที่นำไปตั้ง</Label>
              <Input
                id="station-room"
                required
                aria-invalid={showErrors && !!errors.room}
                placeholder="เช่น ห้องพยาบาล อาคาร 3"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                className={fieldCls}
              />
              {showErrors && errors.room && <FieldError>{errors.room}</FieldError>}
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

            <div className="space-y-2">
              <Label htmlFor="station-notes">หมายเหตุ</Label>
              <Textarea id="station-notes" placeholder="หมายเหตุ (optional)..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={fieldCls} />
            </div>
          </fieldset>
        </div>

        {/* Footer band */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
          <Button variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            ยืนยัน
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return <p role="alert" className="text-xs text-destructive">{children}</p>;
}
