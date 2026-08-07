"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Wrench, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DIALOG_SHELL, DIALOG_BODY, Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fmtDate, TH_DATE } from "@/lib/format";
import { recoverStock } from "@/lib/api";

/** One open แจ้งชำรุด booking — as served by GET /api/items/:id (`openDamage`). */
export interface OpenDamage {
  id: string;
  qty: number;
  notes: string | null;
  adjustedAt: string;
  by: string;
}

/**
 * รับคืนจากซ่อม — hands damaged stock back to the shelf.
 *
 * One booking at a time, not a free qty box. Each แจ้งชำรุด is its own StockAdjustment with
 * its own note ("ขาหัก 3 ตัว"), and recovery stamps `recoveredAt` on that row — which is what
 * lets the ชำรุด figure be derived from open rows instead of a counter that could drift. A
 * loose "put back N" would have nothing to stamp, so the two numbers would part ways on the
 * first partial repair. Split a booking that comes back in pieces by booking the remainder
 * as ชำรุด again; the notes keep the story.
 */
export function RecoverDamageDialog({ open, onOpenChange, itemId, unit, rows, onSuccess }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemId: string;
  unit: string;
  rows: OpenDamage[];
  onSuccess: () => void;
}) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const target = rows.find((r) => r.id === targetId) ?? null;

  const close = () => { setTargetId(null); setNote(""); onOpenChange(false); };

  const doRecover = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await recoverStock(itemId, { source: "ADJUSTMENT", kind: "DAMAGED", recordId: target.id, note: note.trim() || undefined });
      toast.success(`รับคืน ${target.qty} ${unit} เข้าคลังแล้ว`);
      close();
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "รับคืนไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg gap-0 overflow-hidden p-0 sm:rounded-2xl" showCloseButton={false}>
        <DialogTitle className="sr-only">รับคืนจากซ่อม</DialogTitle>
        <DialogDescription className="sr-only">คืนของที่ซ่อมเสร็จกลับเข้าคลัง</DialogDescription>

        <div className={DIALOG_SHELL}>
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning-700">
                <Wrench className="h-4 w-4" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">รับคืนจากซ่อม</p>
                <p className="text-xs text-muted-foreground">เลือกรายการที่ซ่อมเสร็จ ของจะกลับเข้ายอดว่าง</p>
              </div>
            </div>
            <button onClick={close} aria-label="ปิด" className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className={cn(DIALOG_BODY, "bg-secondary/40 px-6 py-6 space-y-4")}>
            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">ไม่มีรายการชำรุดค้างอยู่</p>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => {
                  const picked = r.id === targetId;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setTargetId(picked ? null : r.id)}
                      className={cn(
                        "w-full rounded-lg border bg-card px-3 py-2.5 text-left transition-colors",
                        picked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold tabular-nums">{r.qty} {unit}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(r.adjustedAt, TH_DATE)} · {r.by}</span>
                      </div>
                      {r.notes && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{r.notes}</p>}
                    </button>
                  );
                })}
              </div>
            )}

            {target && (
              <div className="space-y-2">
                <Label>หมายเหตุการซ่อม</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="เช่น เปลี่ยนอะไหล่แล้ว ใช้งานได้ปกติ"
                  rows={3}
                  className="bg-card"
                />
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
            <Button variant="ghost" onClick={close}>ยกเลิก</Button>
            <Button onClick={doRecover} disabled={!target || saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {target ? `รับคืน ${target.qty} ${unit}` : "เลือกรายการ"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
