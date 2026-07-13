"use client";

import { useState, useEffect, type ComponentProps } from "react";
import { Package, X, Check, ChevronDown, TriangleAlert } from "lucide-react";
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
import { FileUpload } from "@/components/shared/file-upload";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ADJUSTMENT_REASON_OPTIONS, TRACKED_ADJUST_STATUS_OPTIONS, STATUS_LABELS, STATUS_PILLS, formatSubCode } from "@/lib/constants";
import { adjustStock, bulkUpdateSubItemStatus } from "@/lib/api";

export interface AdjustLot {
  id: string;
  lotNumber: string;
  remainingQty: number;
  expiryDate?: string | null;
}

export interface AdjustSubItem {
  id: string;
  subCode: string;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemCode?: string;
  availableQty: number;
  totalQty: number;
  checkedOutCount: number;
  /** If provided and non-empty, the dialog corrects a specific lot (consumable). */
  lots?: AdjustLot[];
  /** Tracked (per-piece) item: dialog switches to per-piece status mode. */
  trackIndividually?: boolean;
  subItems?: AdjustSubItem[];
  /** When set, dialog locks to this single sub-item (no picker). */
  fixedSubItemId?: string;
  /** When set, count-mode locks the reason (e.g. "DAMAGED") — opens as a damage report that decrements qty. */
  fixedReason?: string;
  onSuccess: () => void;
}

export function StockAdjustmentDialog({ open, onOpenChange, itemId, itemCode, availableQty, totalQty, checkedOutCount, lots, trackIndividually, subItems, fixedSubItemId, fixedReason, onSuccess }: Props) {
  // Full sub-code shown to staff (e.g. NLU-KRU-001-C01); falls back to raw when no itemCode.
  const fmtCode = (code: string) => formatSubCode(itemCode ?? "", code);
  const lotMode = !!lots && lots.length > 0;
  const trackedMode = !!trackIndividually;
  const fixedMode = trackedMode && !!fixedSubItemId;

  // Count-mode state (lot / shelf)
  const [selectedLotId, setSelectedLotId] = useState("");
  const [count, setCount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [imageEvidence, setImageEvidence] = useState<string | null>(null);

  // Tracked-mode state
  const [selectedSubIds, setSelectedSubIds] = useState<Set<string>>(new Set());
  const [targetStatus, setTargetStatus] = useState("");
  const [subSearch, setSubSearch] = useState("");
  const [subOpen, setSubOpen] = useState(false);

  const [saving, setSaving] = useState(false);

  // Default-select the first lot when entering lot mode; reset on close
  useEffect(() => {
    if (open && lotMode && lots && !selectedLotId) setSelectedLotId(lots[0]?.id ?? "");
    if (!open) {
      setCount(""); setReason(""); setNotes(""); setImageEvidence(null);
      setSelectedSubIds(new Set()); setTargetStatus(""); setSubSearch("");
    }
  }, [open, lotMode, lots, selectedLotId]);

  // Pre-select the first subItem when opening in tracked mode (only on open
  // transition, so clearing the selection isn't clobbered back to the first piece).
  useEffect(() => {
    if (open && trackedMode && !fixedMode && subItems && subItems.length > 0) {
      setSelectedSubIds(new Set([subItems[0].id]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Lock the reason when opened in fixed-reason mode (e.g. damage report on a consumable).
  useEffect(() => {
    if (open && fixedReason) setReason(fixedReason);
  }, [open, fixedReason]);

  const parsed = count !== "" ? parseInt(count) : null;
  const safe = parsed !== null && !isNaN(parsed) ? parsed : null;
  const selectedLot = lotMode ? lots?.find((l) => l.id === selectedLotId) : null;
  const lotPrev = selectedLot?.remainingQty ?? 0;

  // New item-level totals for preview (count-mode only)
  const newAvailable = lotMode
    ? (safe !== null ? availableQty - lotPrev + safe : availableQty)
    : (safe ?? 0);
  const newTotal = lotMode ? null : (safe !== null ? safe + checkedOutCount : null);

  const noChange = lotMode ? safe === lotPrev : safe !== null && newTotal !== null && newTotal === totalQty;

  const effectiveSubIds = fixedMode && fixedSubItemId ? new Set([fixedSubItemId]) : selectedSubIds;

  const filteredSubs = (subItems ?? []).filter((s) =>
    fmtCode(s.subCode).toLowerCase().includes(subSearch.trim().toLowerCase()),
  );
  const selectedSubs = (subItems ?? []).filter((s) => effectiveSubIds.has(s.id));

  function toggleSub(id: string) {
    setSelectedSubIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (trackedMode) {
      if (effectiveSubIds.size === 0 || !targetStatus) return;
    } else {
      if (safe === null || !reason) return;
      if (lotMode && !selectedLotId) return;
    }
    setSaving(true);
    try {
      if (trackedMode) {
        await bulkUpdateSubItemStatus(itemId, {
          subItemIds: Array.from(effectiveSubIds),
          newStatus: targetStatus,
          notes: notes || null,
        });
        toast.success("ปรับสถานะรายชิ้นแล้ว");
      } else if (lotMode) {
        await adjustStock(itemId, { lotId: selectedLotId, lotCount: safe!, reason, notes: notes || null, imageEvidence: imageEvidence || null });
        toast.success("แก้ยอด Lot แล้ว");
      } else {
        await adjustStock(itemId, { shelfCount: safe!, reason, notes: notes || null, imageEvidence: imageEvidence || null });
        toast.success("ปรับสต็อกแล้ว");
      }
      onOpenChange(false);
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
    setSaving(false);
  }

  const title = trackedMode ? "ปรับสถานะพัสดุรายชิ้น" : lotMode ? "แก้ยอด Lot" : "ปรับสต็อก";
  const subtitle = trackedMode
    ? "เลือกชิ้นที่หาย/พ้นสภาพ แล้วเปลี่ยนสถานะ (สูญหาย/ตัดจำหน่าย)"
    : lotMode ? "ตรวจนับยอดจริงของ lot แล้วบันทึก" : "ตรวจนับของบนชั้นวางแล้วบันทึก";

  // Damage-report mode (consumable): override copy + icon to match the "แจ้งชำรุด" tile.
  // AdjustmentReason has no plain DAMAGED; DAMAGED_PENDING_REPAIR is the damaged-stock bucket.
  const isDamage = fixedReason === "DAMAGED_PENDING_REPAIR";
  const fixedReasonLabel = fixedReason
    ? ADJUSTMENT_REASON_OPTIONS.find((r) => r.value === fixedReason)?.label ?? fixedReason
    : null;
  const effectiveTitle = fixedReasonLabel ? (isDamage ? "แจ้งชำรุด" : `บันทึก${fixedReasonLabel}`) : title;
  const effectiveSubtitle = fixedReasonLabel
    ? "ตัดยอดของที่ชำรุด/เสีย พร้อมบันทึกเหตุผล"
    : subtitle;

  const canSave = trackedMode
    ? effectiveSubIds.size > 0 && !!targetStatus
    : safe !== null && !!reason && (!lotMode || !!selectedLotId);
  const positive = lotMode ? safe! > lotPrev : newTotal! > totalQty;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg gap-0 overflow-hidden p-0 sm:rounded-2xl" showCloseButton={false}>
        <DialogTitle className="sr-only">{effectiveTitle}</DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", isDamage ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
              {isDamage ? <TriangleAlert className="h-4 w-4" /> : <Package className="h-4 w-4" />}
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">{effectiveTitle}</p>
              <p className="text-xs text-muted-foreground">{effectiveSubtitle}</p>
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
          {trackedMode ? (
            <>
              {/* Tracked mode: per-piece status */}
              {!fixedMode && (
              <div className="space-y-2">
                <Label>เลือกชิ้น <span className="text-destructive">*</span></Label>
                <Popover open={subOpen} onOpenChange={setSubOpen}>
                  <PopoverTrigger
                    render={(props: ComponentProps<"button">) => (
                      <button
                        {...props}
                        type="button"
                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <span className={cn("truncate", selectedSubIds.size === 0 && "text-muted-foreground")}>
                          {selectedSubIds.size > 0 ? `เลือกแล้ว ${selectedSubIds.size} ชิ้น` : "เลือกชิ้นที่จะปรับ"}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </button>
                    )}
                  />
                  <PopoverContent align="start" className="w-80 p-0">
                    <div className="border-b border-border p-2">
                      <Input
                        placeholder="ค้นหารหัส..."
                        value={subSearch}
                        onChange={(e) => setSubSearch(e.target.value)}
                        className="h-8 bg-card"
                      />
                    </div>
                    <div className="flex items-center justify-between px-2 py-1.5 text-xs">
                      <span className="text-muted-foreground">{filteredSubs.length} ชิ้น</span>
                      <div className="flex gap-2">
                        <button type="button" className="text-primary hover:underline" onClick={() => setSelectedSubIds(new Set(filteredSubs.map((s) => s.id)))}>เลือกทั้งหมด</button>
                        {selectedSubIds.size > 0 && (
                          <button type="button" className="text-muted-foreground hover:underline" onClick={() => setSelectedSubIds(new Set())}>ล้าง</button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {filteredSubs.length === 0 ? (
                        <p className="px-3 py-4 text-center text-sm text-muted-foreground">ไม่พบชิ้น</p>
                      ) : filteredSubs.map((s) => {
                        const selected = selectedSubIds.has(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggleSub(s.id)}
                            className={cn(
                              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                              selected && "bg-primary/5",
                            )}
                          >
                            <Checkbox checked={selected} tabIndex={-1} className="pointer-events-none" />
                            <span className="font-mono text-foreground">{fmtCode(s.subCode)}</span>
                            <span className={cn("ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]", STATUS_PILLS[s.status] ?? "text-muted-foreground border-border")}>
                              {STATUS_LABELS[s.status] ?? s.status}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
                {selectedSubs.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedSubs.map((s) => (
                      <span
                        key={s.id}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                          STATUS_PILLS[s.status] ?? "text-muted-foreground border-border",
                        )}
                      >
                        <span className="font-mono">{fmtCode(s.subCode)}</span>
                        <button
                          type="button"
                          onClick={() => toggleSub(s.id)}
                          className="rounded-full hover:bg-foreground/10 px-0.5"
                          aria-label={`เอา ${fmtCode(s.subCode)} ออก`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              )}

              {fixedMode && selectedSubs[0] && (
                <div className="space-y-2">
                  <Label>ชิ้นที่ปรับ</Label>
                  <div className="flex items-center gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm">
                    <span className="font-mono text-foreground">{fmtCode(selectedSubs[0].subCode)}</span>
                    <span className={cn("ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]", STATUS_PILLS[selectedSubs[0].status] ?? "text-muted-foreground border-border")}>
                      {STATUS_LABELS[selectedSubs[0].status] ?? selectedSubs[0].status}
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>เปลี่ยนเป็นสถานะ <span className="text-destructive">*</span></Label>
                <Select value={targetStatus} onValueChange={(v) => setTargetStatus(v ?? "")}>
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="เลือกสถานะ">
                      {TRACKED_ADJUST_STATUS_OPTIONS.find((o) => o.value === targetStatus)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TRACKED_ADJUST_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {effectiveSubIds.size > 0 && targetStatus && (
                  <p className="text-sm text-muted-foreground">
                    จะเปลี่ยน <span className="font-medium text-foreground">{effectiveSubIds.size}</span> ชิ้น → <span className="font-medium text-foreground">{STATUS_LABELS[targetStatus]}</span>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>หมายเหตุ</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="เพิ่มรายละเอียด (ถ้ามี)" className="bg-card" />
              </div>
            </>
          ) : (
            <>
              {/* Lot picker — consumable mode */}
              {lotMode && (
                <div className="space-y-2">
                  <Label>Lot <span className="text-destructive">*</span></Label>
                  <Select value={selectedLotId} onValueChange={(v) => { if (v) setSelectedLotId(v); }}>
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="เลือก lot">
                        {(() => {
                          const l = lots?.find((x) => x.id === selectedLotId);
                          if (!l) return undefined;
                          return `${l.lotNumber} — เหลือ ${l.remainingQty}${l.expiryDate ? ` (หมดอายุ ${new Date(l.expiryDate).toLocaleDateString()})` : ""}`;
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {lots!.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.lotNumber} — เหลือ {l.remainingQty}
                          {l.expiryDate ? ` (หมดอายุ ${new Date(l.expiryDate).toLocaleDateString()})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* System qty readout */}
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-3 text-sm">
                {lotMode ? (
                  <>
                    <div>
                      <span className="text-xs text-muted-foreground">ยอด lot นี้ (ระบบ)</span>
                      <p className="font-semibold text-foreground">{lotPrev}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">ยอดรวมทุก lot (available)</span>
                      <p className="font-semibold text-foreground">{availableQty}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="text-xs text-muted-foreground">พัสดุทั้งหมดในระบบ</span>
                      <p className="font-semibold text-foreground">{totalQty}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">ถูกเบิกไปแล้ว</span>
                      <p className="font-semibold text-foreground">{checkedOutCount}</p>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Label>{lotMode ? "นับจริงได้กี่ชิ้น (lot นี้)" : "นับจริงบนชั้นวาง"} <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min="0"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  placeholder={lotMode ? "จำนวนจริงของ lot นี้" : "นับได้กี่ชิ้น?"}
                  className="bg-card"
                />
                {safe !== null && (
                  <p className={cn(
                    "text-sm",
                    noChange ? "text-muted-foreground" : positive ? "text-green-600" : "text-destructive",
                  )}>
                    {lotMode
                      ? `ยอด lot นี้ ${lotPrev} → ${safe} (${safe >= lotPrev ? `เพิ่ม ${safe - lotPrev}` : `ลดลง ${lotPrev - safe}`})`
                      : `รวมใหม่: ${newTotal} (${positive ? `+${newTotal! - totalQty}` : `${newTotal! - totalQty}`})`}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>เหตุผล <span className="text-destructive">*</span></Label>
                {fixedReasonLabel ? (
                  <div className={cn(
                    "flex items-center rounded-md border px-3 py-2 text-sm font-medium",
                    isDamage ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-input bg-card text-foreground",
                  )}>
                    {isDamage && <TriangleAlert className="size-4 mr-2" />}
                    {fixedReasonLabel}
                  </div>
                ) : (
                  <Select value={reason} onValueChange={(v) => setReason(v ?? "")}>
                    <SelectTrigger className="bg-card">
                      <SelectValue placeholder="เลือกเหตุผล">
                        {ADJUSTMENT_REASON_OPTIONS.find((r) => r.value === reason)?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ADJUSTMENT_REASON_OPTIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label>หมายเหตุ</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="เพิ่มรายละเอียด (ถ้ามี)" className="bg-card" />
              </div>

              <div className="space-y-2">
                <Label>รูปภาพประกอบ</Label>
                <FileUpload
                  value={imageEvidence}
                  onChange={setImageEvidence}
                  accept="image/*"
                  label="อัปโหลดรูป"
                />
              </div>
            </>
          )}
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
