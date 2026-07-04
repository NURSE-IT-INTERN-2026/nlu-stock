"use client";

import { useState } from "react";
import { MapPin, Printer, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { QrPrintDialog } from "@/components/shared/qr-print-dialog";
import { LocationCascadePicker } from "@/components/shared/location-cascade-picker";
import { updateItem } from "@/lib/api";

interface MoveItem {
  id: string;
  code: string;
  name: string;
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
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [resolvedName, setResolvedName] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [doneItems, setDoneItems] = useState<MoveItem[]>([]);
  const [qrOpen, setQrOpen] = useState(false);

  const effectiveItems = done ? doneItems : items;
  const bulk = effectiveItems.length > 1;
  const canSave = !!resolvedId;

  const submit = async () => {
    if (!resolvedId) return;
    setSaving(true);
    // #4 allSettled — partial failure still surfaces moved count, no silent half-move.
    const results = await Promise.allSettled(itemIds.map((id) => updateItem(id, { locationId: resolvedId })));
    const moved = items.filter((_, i) => results[i]?.status === "fulfilled");
    const fail = itemIds.length - moved.length;
    setSaving(false);
    if (moved.length === 0) { toast.error("ย้ายที่ตั้งไม่สำเร็จ"); return; }
    if (fail > 0) toast.warning(`ย้าย ${moved.length} สำเร็จ, ล้มเหลว ${fail}`);
    else toast.success(bulk ? `ย้ายที่ตั้ง ${moved.length} รายการเรียบร้อย` : "ย้ายที่ตั้งเรียบร้อย");
    setDoneItems(moved);
    setDone(true);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 overflow-hidden p-0 sm:rounded-2xl" showCloseButton={false}>
        <DialogTitle className="sr-only">ย้ายที่ตั้ง</DialogTitle>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border bg-card px-6 py-4">
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
          <div className="flex flex-col items-center gap-3 bg-secondary/40 px-6 py-8 text-center">
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
          <div className="bg-secondary/40 px-6 py-5">
            <LocationCascadePicker
              initialLocationId={currentLocationId ?? null}
              onChange={(id, name) => { setResolvedId(id); setResolvedName(name ?? ""); }}
            />
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border bg-card px-6 py-4">
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
      </DialogContent>

      <QrPrintDialog open={qrOpen} onClose={() => setQrOpen(false)} items={effectiveItems.map(({ code, name }) => ({ code, name }))} />
    </Dialog>
  );
}
