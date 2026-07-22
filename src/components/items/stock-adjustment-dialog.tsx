"use client";

import { useState, useEffect } from "react";
import { Package, X, Check, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ADJUST_MODE_OPTIONS, ADJUSTMENT_REASON_LABELS, COUNT_SHORT_REASON_OPTIONS, STOCK_COUNT_MODE } from "@/lib/constants";
import { AdjustmentReason } from "@/generated/prisma/enums";
import { adjustStock } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemCode?: string;
  availableQty: number;
  totalQty: number;
  checkedOutCount: number;
  /** Issue unit label, appended after qty readouts. */
  unit?: string;
  /** When set, the mode picker is skipped and the qty is deducted under this reason (e.g. "DAMAGED_PENDING_REPAIR"). */
  fixedReason?: string;
  /** Tracked items can only confirm a count — discrepancies are booked per piece. */
  trackIndividually?: boolean;
  onSuccess: () => void;
}

export function StockAdjustmentDialog({ open, onOpenChange, itemId, itemCode, availableQty, totalQty, checkedOutCount, unit, fixedReason, trackIndividually, onSuccess }: Props) {
  const [mode, setMode] = useState<string>(STOCK_COUNT_MODE);
  const [qty, setQty] = useState("");
  const [shortReason, setShortReason] = useState<string>("LOST");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);

  // Tracked count = confirmation only: no number to type, nothing to adjust.
  const confirmOnly = !!trackIndividually;
  // Damage report and friends deduct pieces under a locked reason.
  const isCount = !fixedReason && mode === STOCK_COUNT_MODE;

  useEffect(() => {
    if (!open) {
      setMode(STOCK_COUNT_MODE); setQty(""); setShortReason("LOST"); setNotes("");
    }
  }, [open]);

  const parsed = qty !== "" ? parseInt(qty) : null;
  const safe = parsed !== null && !isNaN(parsed) ? parsed : null;

  // What SHOULD be on the shelf = total minus checked out. Counts are compared
  // against THIS, not the raw system total. Lots never surface here: staff count the
  // shelf as one number and the server spreads the difference over them (FEFO).
  const prev = totalQty - checkedOutCount;

  // Count mode types the new total; every other mode types how many pieces leave.
  const newQty = safe === null ? null : isCount ? safe : prev - safe;
  const delta = newQty === null ? null : newQty - prev;
  const over = delta !== null && delta > 0;
  const short = delta !== null && delta < 0;
  const tooMany = !isCount && safe !== null && (safe < 1 || safe > prev);
  const unitSuffix = unit ? ` ${unit}` : "";

  // Free-text reasons need a note to be auditable later; so does surplus stock.
  const notesRequired = (isCount && over) || (!fixedReason && !isCount && (mode === "OTHER" || mode === "LOST" || mode === "DISPOSAL"));

  const modeHint = fixedReason ? null : ADJUST_MODE_OPTIONS.find((m) => m.value === mode)?.hint;

  async function handleSave() {
    if (!confirmOnly && (safe === null || tooMany)) return;
    if (notesRequired && !notes.trim()) return;
    setSaving(true);
    try {
      const qtyPayload = confirmOnly ? {} : { shelfCount: newQty! };

      if (isCount) {
        await adjustStock(itemId, {
          stockCount: true,
          ...qtyPayload,
          // Short counts default to สูญหาย but may be booked as ตัดจำหน่าย/อื่นๆ;
          // a surplus is always COUNT_MISMATCH_OVER, decided server-side.
          ...(short ? { reason: shortReason } : {}),
          notes: notes || null,
        });
        toast.success("บันทึกการตรวจนับแล้ว");
      } else {
        await adjustStock(itemId, {
          ...qtyPayload,
          reason: fixedReason ?? mode,
          notes: notes || null,
        });
        toast.success("ปรับสต็อกแล้ว");
      }
      onOpenChange(false);
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
    setSaving(false);
  }

  // Damage-report mode (consumable): override copy + icon to match the "แจ้งชำรุด" tile.
  // AdjustmentReason has no plain DAMAGED; DAMAGED_PENDING_REPAIR is the damaged-stock bucket.
  const isDamage = fixedReason === "DAMAGED_PENDING_REPAIR";
  const fixedReasonLabel = fixedReason
    ? ADJUSTMENT_REASON_LABELS[fixedReason as AdjustmentReason] ?? fixedReason
    : null;
  const title = fixedReasonLabel ? (isDamage ? "แจ้งชำรุด" : `บันทึก${fixedReasonLabel}`) : "ปรับสต็อก";
  const subtitle = fixedReasonLabel
    ? "ตัดยอดของที่ชำรุด/เสีย พร้อมบันทึกเหตุผล"
    : confirmOnly
      ? "ยืนยันว่านับครบตามระบบ"
      : modeHint ?? "";

  const canSave = confirmOnly
    ? true
    : safe !== null && !tooMany && (!notesRequired || !!notes.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg gap-0 overflow-hidden p-0 sm:rounded-2xl" showCloseButton={false}>
        <DialogTitle className="sr-only">{title}</DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", isDamage ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
              {isDamage ? <TriangleAlert className="h-4 w-4" /> : <Package className="h-4 w-4" />}
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] space-y-6 overflow-y-auto bg-secondary/40 px-6 py-6">
          {/* What are we doing? The answer picks the qty input below. */}
          {!fixedReason && !confirmOnly && (
            <div className="space-y-2">
              <Label required>รายการที่ทำ</Label>
              <Select value={mode} onValueChange={(v) => { if (v) { setMode(v); setQty(""); } }}>
                <SelectTrigger className="w-full bg-card">
                  <SelectValue>{ADJUST_MODE_OPTIONS.find((m) => m.value === mode)?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ADJUST_MODE_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* System qty readout */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">จำนวนเบิกใช้งาน</span>
              <p className="font-semibold text-foreground">{checkedOutCount} {unit}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">จำนวนในคลังปัจจุบัน</span>
              <p className="font-semibold text-primary">{prev} {unit}</p>
            </div>
          </div>

          {confirmOnly ? (
            <p className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
              รายการนี้นับรายชิ้น — กดยืนยันเพื่อบันทึกว่าตรวจนับครบ {availableQty} ชิ้นแล้ว
              ถ้าพบชิ้นที่หายหรือชำรุด ให้แจ้งสถานะรายชิ้นแทน
            </p>
          ) : (
          <div className="space-y-2">
            <Label required>{isCount ? "นับจริงบนชั้นวาง" : "จำนวนที่ตัดออก"}</Label>
            <Input
              type="number"
              min={isCount ? "0" : "1"}
              max={isCount ? undefined : prev}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={isCount ? "จำนวนใหม่บนชั้นวางที่นับได้" : "จำนวนชิ้นที่เอาออกจากสต็อก"}
              className="bg-card"
            />
            {tooMany ? (
              <p className="text-sm text-destructive">
                {safe! < 1 ? "ต้องมากกว่า 0" : `ตัดออกได้ไม่เกิน ${prev}`}
              </p>
            ) : safe !== null && newQty !== null && (
              <p className={cn(
                "text-sm",
                delta === 0 ? "text-muted-foreground" : over ? "text-green-600" : "text-destructive",
              )}>
                {isCount
                  ? delta === 0
                    ? `ตรงกับยอดที่ควรมี (${prev})`
                    : `จำนวนจริงจากการนับไม่เท่าจำนวนปัจจุบันในคลัง · ${over ? `เกิน ${delta}${unitSuffix}` : `ขาด ${-delta!}${unitSuffix}`}`
                  : `ยอดคงเหลือ ${prev} → ${newQty}`}
              </p>
            )}
            {isCount && short && (
              <p className="text-xs text-muted-foreground">ส่วนที่ขาดจะถูกบันทึกตามเหตุผลด้านล่าง</p>
            )}
            {isCount && over && (
              <p className="text-xs text-muted-foreground">ส่วนเกินจะบวกเข้ายอดพร้อมใช้งาน</p>
            )}
          </div>
          )}

          {/* A short count is not automatically "หาย" — it may be stock thrown away since the last count. */}
          {isCount && short && (
            <div className="space-y-2">
              <Label required>หมายเหตุการกระทบยอด</Label>
              <Select value={shortReason} onValueChange={(v) => { if (v) setShortReason(v); }}>
                <SelectTrigger className="w-full bg-card">
                  <SelectValue>{COUNT_SHORT_REASON_OPTIONS.find((r) => r.value === shortReason)?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {COUNT_SHORT_REASON_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {fixedReasonLabel && (
            <div className="space-y-2">
              <Label required>เหตุผล</Label>
              <div className={cn(
                "flex items-center rounded-md border px-3 py-2 text-sm font-medium",
                isDamage ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-input bg-card text-foreground",
              )}>
                {isDamage && <TriangleAlert className="size-4 mr-2" />}
                {fixedReasonLabel}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label required={notesRequired}>หมายเหตุ</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isCount && over ? "นับได้เกินยอดระบบ — ระบุที่มาของของส่วนเกิน" : notesRequired ? "ระบุเหตุผลที่ปรับยอด" : "เพิ่มรายละเอียด (ถ้ามี)"}
              className="bg-card"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-card px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button className="gap-1.5" onClick={handleSave} disabled={saving || !canSave}>
            <Check className="h-4 w-4" />
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
