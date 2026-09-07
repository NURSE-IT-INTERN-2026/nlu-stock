"use client";

import { useState } from "react";
import { HandCoins, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DIALOG_SHELL, DIALOG_BODY, Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { selfBorrow } from "@/lib/api";
import { fmtDate, TH_DATETIME } from "@/lib/format";
import { selfBorrowDueAt } from "@/lib/self-borrow";
import {
  SelfBorrowFields, emptySelfBorrowForm, selfBorrowErrors, selfBorrowUsagePayload,
  type SelfBorrowForm,
} from "@/components/dispense/self-borrow-fields";

// ยืมเอง confirm step. Same shell as station-in-room-dialog next door, and for the same
// reason: this takes stock off a shelf the moment it is confirmed, so it gets a step the
// user has to mean, not a button that fires on the first tap.
//
// It asks far less than the cart's ข้อมูลการเบิก-ยืม dialog — ผู้รับ/ชุดเบิก/ตั้งใช้ในห้อง are
// staff bookkeeping about someone else's loan. Here the borrower IS the recipient, and the
// only question this screen owns is how many; the rest is SelfBorrowFields, shared with
// หน้าเบิก-ยืม so the two entry points ask exactly the same things.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemCode: string;
  itemName: string;
  issueUnit: string;
  /** 1 for tracked items — the piece is chosen by the server, not the borrower. */
  max: number;
  isTracked: boolean;
  /** สิ้นเปลือง = เบิกใช้: no due date, and the word "ยืม" would be a lie on the button. */
  isConsume: boolean;
  /** The exact copy being borrowed, when the page is showing one. Omitted on the item page,
   *  where the server picks a free piece instead. */
  subItemId?: string | null;
  onDone: () => void;
}

export function SelfBorrowDialog({
  open, onOpenChange, itemId, itemCode, itemName, issueUnit, max, isTracked, isConsume, subItemId, onDone,
}: Props) {
  const verb = isConsume ? "เบิก" : "ยืม";
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<SelfBorrowForm>(emptySelfBorrowForm);
  const [showErrors, setShowErrors] = useState(false);

  const canConfirm = Object.values(selfBorrowErrors(form)).every((v) => !v);
  const dueAt = selfBorrowDueAt(form.days);

  const close = (o: boolean) => {
    if (!o) {
      setQty(1);
      setForm(emptySelfBorrowForm);
      setShowErrors(false);
    }
    onOpenChange(o);
  };

  const handleSubmit = async () => {
    if (!canConfirm) { setShowErrors(true); return; }
    setSubmitting(true);
    try {
      await selfBorrow({
        lines: [{ itemId, subItemId, quantity: qty }],
        ...selfBorrowUsagePayload(form),
        ...(isConsume ? {} : { days: form.days }),
      });
      toast.success(isConsume ? "เบิกสำเร็จ" : `ยืมสำเร็จ · คืนภายใน ${fmtDate(dueAt, TH_DATETIME)}`);
      close(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${verb}ไม่สำเร็จ`);
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent showCloseButton={false} className="max-w-[calc(100%-2rem)] sm:max-w-[460px] gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">{verb}พัสดุ</DialogTitle>
        <DialogDescription className="sr-only">{itemCode} · {itemName}</DialogDescription>

        <div className={DIALOG_SHELL}>
          {/* Header band */}
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <HandCoins className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-foreground">{verb}พัสดุ</p>
                <p className="text-xs text-muted-foreground truncate"><span className="font-mono">{itemCode}</span> · {itemName}</p>
              </div>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={() => close(false)}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
              aria-label="ปิด"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className={cn(DIALOG_BODY, "bg-secondary/40 px-6 py-6")}>
            <fieldset disabled={submitting} className="m-0 min-w-0 space-y-5 border-0">
              {isTracked ? (
                <p className="text-sm text-muted-foreground">{verb}ได้ครั้งละ 1 {issueUnit}</p>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="borrow-qty" required>จำนวน</Label>
                  <Input
                    id="borrow-qty"
                    type="number"
                    min={1}
                    max={max}
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, Math.min(Number(e.target.value) || 1, max)))}
                    className="h-10 text-foreground bg-card"
                  />
                  <p className="text-xs text-muted-foreground">{verb}ได้สูงสุด {max} {issueUnit}</p>
                </div>
              )}

              <SelfBorrowFields value={form} onChange={setForm} showErrors={showErrors} showDue={!isConsume} />

              <p className="text-xs text-muted-foreground">
                กดยืนยันแล้วระบบจะตัดสต็อกทันที
                {!isConsume && " · นำของมาคืนที่งานพัสดุ เจ้าหน้าที่เป็นผู้ปิดรายการให้"}
              </p>
            </fieldset>
          </div>

          {/* Footer band */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
            <Button variant="ghost" disabled={submitting} onClick={() => close(false)}>ยกเลิก</Button>
            {/* Not disabled on invalid: a dead button says nothing about which field is
                missing. Clicking it turns the messages on instead. */}
            <Button disabled={submitting || max <= 0} onClick={() => void handleSubmit()}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              ยืนยันการ{verb}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
