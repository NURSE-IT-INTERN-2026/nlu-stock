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
import { motion } from "motion/react";
import { Loader2, Search, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { FileUploadList } from "@/components/shared/file-upload";
import { createMaintenance, searchDispenseItems, updateItemStatus } from "@/lib/api";
import { MAINT_RESULT_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId?: string;
  itemLabel?: string;
  subItemId?: string;
  subItemLabel?: string;
  // Heading for the second identity line: "ชิ้น" for a tracked copy, "จำนวน" for a qty booking.
  subItemLabelTitle?: string;
  // Qty stock: the แจ้งชำรุด booking this job closes, in place of a tracked piece. The server
  // hands that booking's units back (or writes them off) — see the maintenance route.
  adjustmentId?: string;
  maintenanceCycleMonths?: number;
  // Opened from the ชำรุด → ส่งซ่อม → รับคืน flow: the job is corrective by definition and
  // doesn't start a maintenance cycle, so both pickers are dropped.
  fromRepair?: boolean;
  // Display-ready lines from the ชำรุด/ส่งซ่อม logs — shown read-only in place of the
  // ปัญหา/อาการ input, since the staff receiving the piece shouldn't retype what was reported.
  repairInfo?: { damage: string | null; venue: string | null; note: string | null; sentAt: string | null };
  // PREVENTIVE only. The piece is already out at a vendor (สถานะ กำลังบำรุงรักษา) and this
  // dialog receives it back, so there is no ภายใน/ภายนอก left to choose — the trip picked it.
  receiving?: boolean;
  // แก้ข้อมูลของเที่ยวที่ยังเปิดอยู่ (ยังไม่รับคืน). ฟอร์มหน้าตาเหมือนใบส่ง แต่ไม่ให้เลือก
  // ภายใน/ภายนอก อีก — ของออกไปแล้ว การเปลี่ยนใจตรงนี้แปลว่าแก้ประวัติ ไม่ใช่แก้ข้อมูล
  editSend?: boolean;
  // เที่ยวที่ส่งไป อ่านจาก ItemStatusLog แถวล่าสุด — โชว์อ่านอย่างเดียวตอนรับคืน คนรับไม่ต้อง
  // พิมพ์ซ้ำสิ่งที่คนส่งบันทึกไว้แล้ว (เหมือน repairInfo ของ flow ส่งซ่อม)
  sentInfo?: { note: string | null; sentAt: string | null };
  onSuccess: () => void;
}

interface SearchItem {
  id: string;
  code: string;
  name: string;
  category: { name: string; category: string };
}

export function MaintenanceFormDialog({ open, onOpenChange, itemId, itemLabel, subItemId, subItemLabel, subItemLabelTitle = "ชิ้น", adjustmentId, maintenanceCycleMonths, fromRepair, repairInfo, receiving, editSend, sentInfo, onSuccess }: Props) {
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
  // บำรุงรักษาที่ไหน. ภายใน = ช่างในหน่วยงานทำเอง จบในครั้งเดียว บันทึกผลเลย.
  // ภายนอก = ของออกจากหน่วยงานไป ต้องรอกลับมาก่อนถึงจะรู้ผล จึงเดินเหมือน flow ส่งซ่อมทุกประการ:
  // ส่งออกไปก่อน (สถานะ กำลังบำรุงรักษา) แล้วค่อยกลับมาบันทึกผลตอนรับคืน.
  const [venue, setVenue] = useState<"INTERNAL" | "EXTERNAL">("INTERNAL");
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  // null = follow the auto-calculated date; a string = staff typed their own.
  const [nextOverride, setNextOverride] = useState<string | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
  // ปุ่มบันทึกต้องปิดระหว่างอัปโหลด — FileUploadList push URL เข้า onChange หลัง putFile เสร็จ
  // กดทันก่อนหน้านั้นจะบันทึกไปด้วยรายการไฟล์ว่าง แล้วหลักฐานหายเงียบๆ ทั้งที่เลือกไฟล์แล้ว
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Reset on open/close ──
  useEffect(() => {
    if (open) {
      setSelectedItemId(itemId ?? null);
      setSearchQuery("");
      setSearchResults([]);
      // The dialog is one instance reused by every row, so the venue has to be re-armed per
      // open — otherwise the last row's ภายนอก silently sends the next one out too.
      setVenue(receiving || editSend ? "EXTERNAL" : "INTERNAL");
      // แก้ข้อมูล = เปิดของเดิมมาแก้ ไม่ใช่พิมพ์ใหม่ทั้งหมด
      if (editSend) setDescription(sentInfo?.note ?? "");
    }
  }, [open, itemId, receiving, editSend, sentInfo?.note]);

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

  // ส่งบำรุงรักษาภายนอก — ยังไม่ใช่การบันทึกผล ของแค่ออกจากหน่วยงานไป. เขียนแค่สถานะ
  // (พร้อมใช้งาน → กำลังบำรุงรักษา) เหมือน ส่งซ่อม; MaintenanceRecord จะเกิดตอนรับคืน
  // ซึ่งเป็นตอนเดียวที่รู้ผล ค่าใช้จ่าย และรอบถัดไป.
  const sending = !fromRepair && !receiving && (editSend || venue === "EXTERNAL");

  const handleSubmit = async () => {
    const targetId = selectedItemId;
    if (!targetId) {
      toast.error("กรุณาเลือกพัสดุ");
      return;
    }
    if (sending && !description.trim()) {
      toast.error("กรุณาระบุหน่วยงานผู้รับงานและรายการที่ให้ดำเนินการ");
      return;
    }
    setSubmitting(true);
    try {
      if (sending) {
        await updateItemStatus(targetId, {
          newStatus: "PENDING_MAINTENANCE",
          subItemId: subItemId ?? undefined,
          // The edit is the same trip: it appends a PENDING_MAINTENANCE → PENDING_MAINTENANCE
          // log row, and the server keeps reading the departure row for "ออกไปกี่วันแล้ว".
          notes: `${editSend ? "แก้ข้อมูลส่งบำรุงรักษา" : "ส่งบำรุงรักษาภายนอก"} — ${description.trim()}`,
          imageUrls: attachmentUrls,
          repairVenue: "EXTERNAL",
          repairNote: description.trim(),
        });
        toast.success(editSend ? "แก้ข้อมูลแล้ว" : "ส่งบำรุงรักษาภายนอกแล้ว");
        resetAndClose();
        onSuccess();
        return;
      }
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
        attachmentUrls,
        subItemId: subItemId ?? undefined,
        adjustmentId: adjustmentId ?? undefined,
        // CORRECTIVE reads its venue off the ส่งซ่อม log; a PREVENTIVE round has no log to read
        // when it was done in-house, so the form is the only place that knows.
        repairVenue: fromRepair ? undefined : venue,
      });
      toast.success(receiving ? "รับคืนจากบำรุงรักษาแล้ว" : "บันทึกการบำรุงรักษาแล้ว");
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
    setVenue("INTERNAL");
    setPerformedAt(new Date().toISOString().split("T")[0]);
    setDescription("");
    setCost("");
    setNextOverride(null);
    setAttachmentUrls([]);
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
                  {fromRepair
                    ? "บันทึกการบำรุงรักษาหรือซ่อมแซมพัสดุ"
                    : receiving
                      ? "รับคืนจากบำรุงรักษาภายนอก"
                      : editSend
                        ? "แก้ข้อมูลส่งบำรุงรักษา"
                        : sending
                          ? "ส่งบำรุงรักษาภายนอก"
                          : "บันทึกการบำรุงรักษา"}
                </p>
                {/* Says where repairs go now that ซ่อมแซม is no longer pickable here. */}
                {!fromRepair && (
                  <p className="text-xs text-muted-foreground">
                    {receiving
                      ? "รับพัสดุคืนแล้ว · บันทึกผลการบำรุงรักษารอบนี้"
                      : editSend
                        ? `เที่ยวเดิม${sentInfo?.sentAt ? ` · ส่งเมื่อ ${sentInfo.sentAt}` : ""} · วันที่ส่งไม่เปลี่ยน`
                        : sending
                          ? "พัสดุออกจากหน่วยงาน · บันทึกผลเมื่อรับคืน"
                          : "ตรวจบำรุงตามรอบ · งานซ่อมให้แจ้งชำรุดแล้วส่งซ่อม"}
                  </p>
                )}
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
                    <span className="text-muted-foreground">{subItemLabelTitle}:</span>
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

            {/* ภายใน = จบตรงนี้ บันทึกผลเลย. ภายนอก = ของต้องออกไปก่อน ฟอร์มจึงเปลี่ยนเป็นใบส่ง
                และช่องที่ยังไม่มีคำตอบ (ค่าใช้จ่าย, รอบถัดไป) หายไปจนกว่าจะรับคืน — เหมือน ส่งซ่อม
                ทุกประการ. รับคืนไม่ต้องเลือกอีก เพราะเที่ยวที่ส่งไปเลือกไว้แล้ว. */}
            {!fromRepair && !receiving && !editSend && (
              <div className="space-y-2">
                <Label>บำรุงรักษาที่</Label>
                {/* สองตัวเลือกเห็นพร้อมกันเสมอ ไม่ใช่ on/off ที่ต้องเดาว่า "ปิด" แปลว่าอะไร —
                    ปุ่มที่เลือกอยู่มีแถบเลื่อนตามไป (layoutId) */}
                <div role="group" aria-label="บำรุงรักษาที่" className="relative flex rounded-xl border bg-secondary/60 p-1">
                  {([["INTERNAL", "ภายใน NLU"], ["EXTERNAL", "ภายนอก NLU"]] as const).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVenue(v)}
                      aria-pressed={venue === v}
                      className={cn(
                        "relative flex-1 rounded-lg px-3 py-1.5 text-sm transition-colors",
                        venue === v ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {venue === v && (
                        <motion.span
                          layoutId="maint-venue-toggle"
                          transition={{ type: "spring", stiffness: 450, damping: 35 }}
                          className="absolute inset-0 rounded-lg border bg-card shadow-sm"
                        />
                      )}
                      <span className="relative">{label}</span>
                    </button>
                  ))}
                </div>
                {/* หมายเหตุเปลี่ยนตามที่เลือก — ผู้ใช้ต้องอ่านได้ทันทีว่ากดแล้วเกิดอะไร
                    ไม่ใช่ต้องเดาจากชื่อตัวเลือก */}
                <p className="text-xs text-muted-foreground">
                  {sending
                    ? "ส่งพัสดุออกไปบำรุงรักษากับหน่วยงานภายนอก NLU · บันทึกผลเมื่อรับคืน"
                    : "ดำเนินการบำรุงรักษาภายใน NLU · บันทึกผลได้ทันที"}
                </p>
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

            {/* ส่งออกไปยังไม่มี "วันที่ดำเนินการ" ให้กรอก — วันที่ส่งคือวันนี้ และ log บันทึกให้เอง
                เหมือน repairSentAt ของ ส่งซ่อม. */}
            {!sending && (
              <div className="space-y-2">
                <Label>{fromRepair ? "วันที่รับคืนจากการซ่อม" : receiving ? "วันที่รับคืนจากบำรุงรักษา" : "วันที่ดำเนินการ"}</Label>
                <DatePicker
                  value={performedAt}
                  onChange={setPerformedAt}
                  className="h-9 bg-card"
                />
              </div>
            )}

            {receiving && (
              <div className="space-y-2">
                <Label>ข้อมูลการส่งบำรุงรักษา</Label>
                <dl className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm space-y-1.5">
                  {([
                    ["ส่งบำรุงรักษาที่", "ภายนอก NLU"],
                    ["รายละเอียด", sentInfo?.note],
                    ["วันที่ส่ง", sentInfo?.sentAt],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="flex gap-2">
                      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
                      <dd className="min-w-0 text-foreground">{value || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

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
              <Label required={sending}>
                {fromRepair ? "ข้อมูลการดำเนินการซ่อมแซม" : sending ? "หน่วยงานผู้รับงานและรายการที่ให้ดำเนินการ" : "รายละเอียดงานที่ทำ"}
              </Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={sending ? "ระบุหน่วยงานผู้รับงาน และรายการที่ให้ดำเนินการ..." : "งานที่ดำเนินการ..."}
                rows={2}
                className="bg-card"
              />
            </div>

            <div className={cn("grid grid-cols-1 gap-3", !fromRepair && !sending && "sm:grid-cols-2", sending && "hidden")}>
              <div className="space-y-2">
                <Label>{fromRepair ? "ค่าใช้จ่ายในการซ่อมแซมครั้งนี้" : "ค่าใช้จ่ายในการบำรุงรักษา"}</Label>
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
              {!fromRepair && !sending && (
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
              <FileUploadList value={attachmentUrls} onChange={setAttachmentUrls} label="แนบเอกสาร" onUploadingChange={setUploading} />
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-card px-4 sm:px-6 py-4">
            <Button variant="ghost" onClick={resetAndClose}>ยกเลิก</Button>
            <Button disabled={submitting || uploading || !selectedItemId} onClick={handleSubmit} className="gap-1.5">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {editSend ? "บันทึกการแก้ไข" : sending ? "ส่งบำรุงรักษา" : receiving ? "บันทึกรับคืน" : "บันทึก"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
