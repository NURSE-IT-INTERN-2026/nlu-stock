"use client";

import { useState } from "react";
import { MapPin, Printer, Check, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DIALOG_SHELL_FIT, DIALOG_BODY, Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { QrPrintDialog } from "@/components/shared/qr-print-dialog";
import { LocationCascadePicker, type LocationRef, resolveLocationId } from "@/components/shared/location-cascade-picker";
import { updateItem } from "@/lib/api";

interface MoveItem {
  id: string;
  code: string;
  name: string;
  /** ที่อยู่ปัจจุบันของรายการนี้ — ใช้กันการย้ายไปที่เดิม (ดู alreadyHere) */
  location?: { building: string; floor: string; room: string; detail: string | null } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: MoveItem[];
  /** single-item mode: pre-select the current location. omitted for bulk. */
  currentLocationId?: string | null;
  onSuccess: () => void;
}

export function MoveLocationDialog({ open, onOpenChange, items, currentLocationId, onSuccess }: Props) {
  const itemIds = items.map((i) => i.id);
  const [ref, setRef] = useState<LocationRef>({ kind: "none" });
  const [resolvedName, setResolvedName] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [doneItems, setDoneItems] = useState<MoveItem[]>([]);
  const [qrOpen, setQrOpen] = useState(false);

  const effectiveItems = done ? doneItems : items;
  const bulk = effectiveItems.length > 1;

  // ย้ายไปที่ที่ของอยู่แล้ว = ไม่มีอะไรเกิดขึ้น: PATCH /api/items/[id] เขียน LocationChangeLog
  // เฉพาะตอน locationId เปลี่ยนจริง ผลคือ toast เขียว "ย้ายเรียบร้อย" ทั้งที่ประวัติไม่มีแถวใหม่
  // ซึ่งอ่านได้ว่าระบบทำงานพลาด. บอกไปตรงๆ ก่อนกดดีกว่าเงียบแล้วไม่เกิดอะไร
  //
  // เทียบด้วย building/floor/room/detail ไม่ใช่ id เพราะ picker คืนเป็นคำอธิบายที่ยังไม่ผูก id
  // (ปลายทางอาจเป็นสถานที่ใหม่ที่ยังไม่มีในตาราง — resolveLocationId เพิ่งไปสร้างตอนกดบันทึก)
  const sameAsRef = (loc: MoveItem["location"]) =>
    ref.kind === "ok" && !!loc &&
    loc.building === ref.building && loc.floor === ref.floor &&
    loc.room === ref.room && (loc.detail ?? "") === (ref.detail ?? "");
  // เลือกหลายรายการที่อยู่คนละที่ ย้ายได้ตามปกติ — บล็อกเฉพาะตอนไม่มีรายการไหนขยับเลย
  const alreadyHere = ref.kind === "ok" && items.length > 0 && items.every((i) => sameAsRef(i.location));

  const canSave = ref.kind === "ok" && !alreadyHere;

  const submit = async () => {
    // ปุ่มถูก disable อยู่แล้ว การ์ดนี้ไว้กันทางเข้าอื่น (กด Enter, เปลี่ยนปลายทางระหว่างบันทึก)
    if (ref.kind !== "ok" || alreadyHere) return;
    setSaving(true);
    // find-or-create the destination once (picker emits a descriptor, not an id).
    const locationId = await resolveLocationId(ref).catch(() => null);
    if (!locationId) { setSaving(false); toast.error("ย้ายที่ตั้งไม่สำเร็จ"); return; }
    // #4 allSettled — partial failure still surfaces moved count, no silent half-move.
    const results = await Promise.allSettled(itemIds.map((id) => updateItem(id, { locationId })));
    const moved = items.filter((_, i) => results[i]?.status === "fulfilled");
    const fail = itemIds.length - moved.length;
    setSaving(false);
    if (moved.length === 0) { toast.error("ย้ายที่ตั้งไม่สำเร็จ"); return; }
    if (fail > 0) toast.warning(`ย้าย ${moved.length} สำเร็จ, ล้มเหลว ${fail}`);
    else toast.success(bulk ? `ย้ายที่ตั้ง ${moved.length} รายการเรียบร้อย` : "ย้ายที่ตั้งเรียบร้อย");
    setResolvedName(ref.name);
    setDoneItems(moved);
    setDone(true);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 overflow-hidden p-0 sm:rounded-2xl" showCloseButton={false}>
        <DialogTitle className="sr-only">ย้ายที่ตั้ง</DialogTitle>

       <div className={DIALOG_SHELL_FIT}>
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-6 py-4">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MapPin className="size-4" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">ย้ายที่ตั้ง</p>
            <p className="text-xs text-muted-foreground">{bulk ? `${effectiveItems.length} รายการ` : "เลือกสถานที่ใหม่"}</p>
          </div>
        </div>

        {done ? (
          /* ── Success ── */
          <div className={cn(DIALOG_BODY, "flex flex-col items-center justify-center gap-3 bg-secondary/40 px-6 py-8 text-center")}>
            <div className="flex size-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
              <Check className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">ย้ายไปยัง {resolvedName} เรียบร้อย</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{bulk ? `${effectiveItems.length} รายการ` : effectiveItems[0]?.name}</p>
            </div>
            <Button variant="outline" size="sm" className="mt-1 gap-1.5" onClick={() => setQrOpen(true)}>
              <Printer className="size-3.5" /> พิมพ์ QR code
            </Button>
          </div>
        ) : (
          /* ── Cascade picker ── */
          <div className={cn(DIALOG_BODY, "bg-secondary/40 px-6 py-5")}>
            <LocationCascadePicker
              initialLocationId={currentLocationId ?? null}
              onChange={setRef}
            />
            {alreadyHere && (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  {bulk ? "ทุกรายการที่เลือกอยู่ที่นี่อยู่แล้ว" : `${items[0]?.name ?? "รายการนี้"} อยู่ที่นี่อยู่แล้ว`}
                  {" — เลือกที่ตั้งอื่น"}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-card px-6 py-4">
          {done ? (
            <Button size="sm" onClick={() => onOpenChange(false)}>เสร็จสิ้น</Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>ยกเลิก</Button>
              <Button size="sm" onClick={submit} disabled={saving || !canSave}>
                {saving ? "กำลังบันทึก…" : "บันทึก"}
              </Button>
            </>
          )}
        </div>
       </div>
      </DialogContent>

      <QrPrintDialog open={qrOpen} onClose={() => setQrOpen(false)} items={effectiveItems.map(({ code, name }) => ({ code, name }))} />
    </Dialog>
  );
}
