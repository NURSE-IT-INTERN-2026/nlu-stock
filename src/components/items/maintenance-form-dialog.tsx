"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  DIALOG_SHELL,
  DIALOG_BODY,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Loader2, Search, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { FileUpload } from "@/components/shared/file-upload";
import { createMaintenance, searchDispenseItems } from "@/lib/api";
import { MAINT_RESULT_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId?: string;
  itemLabel?: string;
  subItemId?: string;
  subItemLabel?: string;
  maintenanceCycleMonths?: number;
  // Opened from the ชำรุด → ส่งซ่อม → รับคืน flow: the job is corrective by definition and
  // doesn't start a maintenance cycle, so both pickers are dropped.
  fromRepair?: boolean;
  // Display-ready lines from the ชำรุด/ส่งซ่อม logs — shown read-only in place of the
  // ปัญหา/อาการ input, since the staff receiving the piece shouldn't retype what was reported.
  repairInfo?: { damage: string | null; venue: string | null; note: string | null; sentAt: string | null };
  onSuccess: () => void;
}

interface SearchItem {
  id: string;
  code: string;
  name: string;
  category: { name: string; category: string };
}

export function MaintenanceFormDialog({ open, onOpenChange, itemId, itemLabel, subItemId, subItemLabel, maintenanceCycleMonths, fromRepair, repairInfo, onSuccess }: Props) {
  // ── Item selection ──
  const hasDefaultItem = !!itemId;
  const [selectedItemId, setSelectedItemId] = useState<string | null>(itemId ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Form fields ──
  // ประเภท is derived, never picked. A CORRECTIVE job only exists as the tail of the
  // ชำรุด → ส่งซ่อม → รับคืน flow, which is the `fromRepair` caller and the only place that
  // collects the venue, the damage note and the status trail the record needs to be complete.
  // Letting staff pick ซ่อมแซม here produced half-records (no venue, no logs) that landed in
  // the same table cost-by-venue reporting reads.
  const type: "PREVENTIVE" | "CORRECTIVE" = fromRepair ? "CORRECTIVE" : "PREVENTIVE";
  const [result, setResult] = useState<"AVAILABLE" | "DISPOSED">("AVAILABLE");
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  // null = follow the auto-calculated date; a string = staff typed their own.
  const [nextOverride, setNextOverride] = useState<string | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Reset on open/close ──
  useEffect(() => {
    if (open) {
      setSelectedItemId(itemId ?? null);
      setSearchQuery("");
      setSearchResults([]);
    }
  }, [open, itemId]);

  // ── Item search ──
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const data = await searchDispenseItems({ q, perPage: "20" });
      setSearchResults((data.items ?? []) as SearchItem[]);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (hasDefaultItem) return; // no search when item is pre-selected
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(searchQuery), 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchQuery, doSearch, hasDefaultItem]);

  // ── Next maintenance date ──
  // Preview only. The server owns the rule (lib/maintenance scheduleNextMaintenance) and
  // applies it whenever this field is omitted; what's mirrored here must match it, and is
  // sent back only when staff picked their own date. `cycle` is 0 when the caller doesn't
  // pass maintenanceCycleMonths — then the preview is blank and the server fills it in.
  const cycle = maintenanceCycleMonths ?? 0;
  const autoNext = (() => {
    if (cycle <= 0 || !performedAt) return "";
    const d = new Date(performedAt);
    d.setMonth(d.getMonth() + cycle);
    return d.toISOString().split("T")[0];
  })();
  const nextMaintenanceAt = nextOverride ?? autoNext;

  const handleSubmit = async () => {
    const targetId = selectedItemId;
    if (!targetId) {
      toast.error("กรุณาเลือกพัสดุ");
      return;
    }
    setSubmitting(true);
    try {
      await createMaintenance(targetId, {
        type,
        result,
        performedAt,
        // The reported symptom lives on the ชำรุด log — carry it over; a PREVENTIVE round has none.
        issue: (fromRepair ? repairInfo?.damage : null) || null,
        description: description || null,
        cost: cost ? parseFloat(cost) : null,
        // Override only — omitted means "server, apply the rule". Sending the previewed
        // value would fork the rule into the client again.
        nextMaintenanceAt: nextOverride || undefined,
        attachmentUrls: attachmentUrl ? [attachmentUrl] : [],
        subItemId: subItemId ?? undefined,
      });
      toast.success("บันทึกการบำรุงรักษาแล้ว");
      resetAndClose();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setResult("AVAILABLE");
    setPerformedAt(new Date().toISOString().split("T")[0]);
    setDescription("");
    setCost("");
    setNextOverride(null);
    setAttachmentUrl(null);
    setSelectedItemId(itemId ?? null);
    setSearchQuery("");
    setSearchResults([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg gap-0 overflow-hidden p-0 sm:rounded-2xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">บันทึกการบำรุงรักษา</DialogTitle>
        <DialogDescription className="sr-only">
          ฟอร์มบันทึกการบำรุงรักษาพัสดุ
        </DialogDescription>

        <div className={DIALOG_SHELL}>
          {/* ── Header ── */}
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 sm:px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Wrench className="h-4 w-4" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">
                  {fromRepair ? "บันทึกการบำรุงรักษาหรือซ่อมแซมพัสดุ" : "บันทึกการบำรุงรักษา"}
                </p>
                {/* Says where repairs go now that ซ่อมแซม is no longer pickable here. */}
                {!fromRepair && <p className="text-xs text-muted-foreground">ตรวจบำรุงตามรอบ · งานซ่อมให้แจ้งชำรุดแล้วส่งซ่อม</p>}
              </div>
            </div>
            <button
              onClick={resetAndClose}
              aria-label="ปิด"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Body ── */}
          <div className={cn(DIALOG_BODY, "bg-secondary/40 px-4 sm:px-6 py-6 space-y-5")}>
            {/* ── Item selector ── */}
            {hasDefaultItem ? (
              <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">พัสดุ:</span>
                  <span className="font-medium text-foreground">{itemLabel ?? itemId}</span>
                </div>
                {subItemLabel && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">ชิ้น:</span>
                    <span className="font-mono font-medium text-foreground">{subItemLabel}</span>
                  </div>
                )}
              </div>
            ) : selectedItemId ? (
              <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/[0.02] px-3 py-2.5">
                <span className="text-sm font-medium text-foreground">เลือกพัสดุแล้ว</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSelectedItemId(null); setSearchQuery(""); }}
                >
                  เปลี่ยน
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label required>พัสดุ</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="ค้นหาพัสดุจากชื่อหรือรหัส..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-card pl-9"
                  />
                </div>
                {searching && (
                  <div className="text-xs text-muted-foreground py-1">กำลังค้นหา...</div>
                )}
                {searchResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-card divide-y">
                    {searchResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedItemId(item.id);
                          setSearchResults([]);
                          setSearchQuery("");
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                      >
                        <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                        <span className="ml-2">{item.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchQuery && !searching && searchResults.length === 0 && (
                  <div className="text-xs text-muted-foreground py-1">ไม่พบพัสดุ</div>
                )}
              </div>
            )}

            {/* ผลการตรวจ exists only on the repair path. บำรุงรักษา is care for a piece that
                still works — its outcome is always พร้อมใช้งาน, so there is nothing to pick.
                ตัดจำหน่าย has exactly two doors: สูญหาย, and ซ่อมไม่ได้ — this one. */}
            {fromRepair && (
              <div className="space-y-2">
                <Label>ผลการซ่อม</Label>
                <Select value={result} onValueChange={(v) => setResult(v as typeof result)}>
                  <SelectTrigger className="bg-card w-full">
                    <span className="text-foreground">{MAINT_RESULT_LABELS[result]}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {/* Only two outcomes: it works again, or it's written off. Still broken =
                        don't receive it — leave it ส่งซ่อม and edit the repair details. */}
                    <SelectItem value="AVAILABLE">{MAINT_RESULT_LABELS.AVAILABLE}</SelectItem>
                    <SelectItem value="DISPOSED">{MAINT_RESULT_LABELS.DISPOSED}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>{fromRepair ? "วันที่รับคืนจากการซ่อม" : "วันที่ดำเนินการ"}</Label>
              <DatePicker
                value={performedAt}
                onChange={setPerformedAt}
                className="h-9 bg-card"
              />
            </div>

            {fromRepair && (
              <div className="space-y-2">
                <Label>ปัญหา/อาการ</Label>
                <dl className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm space-y-1.5">
                  {([
                    ["อาการที่ชำรุด", repairInfo?.damage],
                    ["ส่งซ่อมที่", repairInfo?.venue],
                    ["รายละเอียด", repairInfo?.note],
                    ["วันที่ส่งซ่อม", repairInfo?.sentAt],
                    // ส่งซ่อมที่ sits above รายละเอียด: where it went is the fact staff scan for,
                    // the free-text note under it can run long.
                  ] as const).map(([label, value]) => (
                    <div key={label} className="flex gap-2">
                      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
                      <dd className="min-w-0 text-foreground">{value || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            <div className="space-y-2">
              <Label>{fromRepair ? "ข้อมูลการดำเนินการซ่อมแซม" : "รายละเอียดงานที่ทำ"}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="งานที่ดำเนินการ..."
                rows={2}
                className="bg-card"
              />
            </div>

            <div className={cn("grid grid-cols-1 gap-3", !fromRepair && "sm:grid-cols-2")}>
              <div className="space-y-2">
                <Label>{fromRepair ? "ค่าใช้จ่ายในการซ่อมแซมครั้งนี้ (฿)" : "ค่าใช้จ่ายในการบำรุงรักษา (฿)"}</Label>
                <Input
                  type="number"
                  min={0}
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0"
                  className="bg-card"
                />
              </div>
              {/* รอบครั้งถัดไป belongs to บำรุงรักษา only. A repair is not a maintenance round:
                  it must not move the cadence, so the field is gone from รับคืนจากส่งซ่อม and
                  the server leaves the existing due date untouched (lib/maintenance
                  nextDateAfterJob). A piece that had no due date at all still gets its first
                  one there, otherwise it would drop off the schedule for good. */}
              {!fromRepair && (
                <div className="space-y-2">
                  <Label>รอบครั้งถัดไป</Label>
                  <DatePicker
                    value={nextMaintenanceAt}
                    onChange={setNextOverride}
                    className="h-9 bg-card"
                  />
                  {nextMaintenanceAt && cycle > 0 ? (
                    <span className="text-[11px] text-muted-foreground">คำนวณอัตโนมัติ: +{cycle} เดือน</span>
                  ) : !nextMaintenanceAt ? (
                    <span className="text-[11px] text-muted-foreground">คำนวณอัตโนมัติจากรอบบำรุงของพัสดุ</span>
                  ) : null}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>เอกสารแนบ</Label>
              <FileUpload
                value={attachmentUrl}
                onChange={setAttachmentUrl}
                accept="image/*,.pdf"
                label="แนบเอกสาร"
              />
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-4 sm:px-6 py-4">
            <Button variant="ghost" onClick={resetAndClose}>ยกเลิก</Button>
            <Button disabled={submitting || !selectedItemId} onClick={handleSubmit} className="gap-1.5">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              บันทึก
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
