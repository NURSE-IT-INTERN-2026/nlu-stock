"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { MAINT_TYPE_LABELS, MAINT_RESULT_LABELS } from "@/lib/constants";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId?: string;
  itemLabel?: string;
  subItemId?: string;
  subItemLabel?: string;
  maintenanceCycleMonths?: number;
  onSuccess: () => void;
}

interface SearchItem {
  id: string;
  code: string;
  name: string;
  category: { name: string; category: string };
}

export function MaintenanceFormDialog({ open, onOpenChange, itemId, itemLabel, subItemId, subItemLabel, maintenanceCycleMonths, onSuccess }: Props) {
  // ── Item selection ──
  const hasDefaultItem = !!itemId;
  const [selectedItemId, setSelectedItemId] = useState<string | null>(itemId ?? null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Form fields ──
  const [type, setType] = useState<"PREVENTIVE" | "CORRECTIVE">("PREVENTIVE");
  const [result, setResult] = useState<"AVAILABLE" | "NEEDS_MORE_REPAIR" | "DISPOSED">("AVAILABLE");
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().split("T")[0]);
  const [issue, setIssue] = useState("");
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

  // ── Auto-calculate next maintenance date ──
  // Only a finished job (result AVAILABLE) starts the next cycle. Still under
  // repair or written off → no appointment, otherwise the piece silently drops
  // off the overdue list / gets scheduled after it's already disposed.
  const cycle = maintenanceCycleMonths ?? 0;
  const schedulesNext = result === "AVAILABLE";
  const autoNext = (() => {
    if (cycle <= 0 || !performedAt) return "";
    const d = new Date(performedAt);
    d.setMonth(d.getMonth() + cycle);
    return d.toISOString().split("T")[0];
  })();
  const nextMaintenanceAt = schedulesNext ? (nextOverride ?? autoNext) : "";

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
        issue: issue || null,
        description: description || null,
        cost: cost ? parseFloat(cost) : null,
        nextMaintenanceAt: nextMaintenanceAt || null,
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
    setType("PREVENTIVE");
    setResult("AVAILABLE");
    setPerformedAt(new Date().toISOString().split("T")[0]);
    setIssue("");
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

        <div className="flex max-h-[85vh] flex-col overflow-hidden">
          {/* ── Header ── */}
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-4 sm:px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Wrench className="h-4 w-4" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">บันทึกการบำรุงรักษา</p>
                <p className="text-xs text-muted-foreground">บำรุงรักษาหรือซ่อมแซมพัสดุ</p>
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
          <div className="flex-1 overflow-y-auto bg-secondary/40 px-4 sm:px-6 py-6 space-y-5">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>ประเภท</Label>
                <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                  <SelectTrigger className="bg-card w-full">
                    <span className="text-foreground">{MAINT_TYPE_LABELS[type]}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PREVENTIVE">{MAINT_TYPE_LABELS.PREVENTIVE}</SelectItem>
                    <SelectItem value="CORRECTIVE">{MAINT_TYPE_LABELS.CORRECTIVE}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>ผลการตรวจ</Label>
                <Select value={result} onValueChange={(v) => setResult(v as typeof result)}>
                  <SelectTrigger className="bg-card w-full">
                    <span className="text-foreground">{MAINT_RESULT_LABELS[result]}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AVAILABLE">{MAINT_RESULT_LABELS.AVAILABLE}</SelectItem>
                    <SelectItem value="NEEDS_MORE_REPAIR">{MAINT_RESULT_LABELS.NEEDS_MORE_REPAIR}</SelectItem>
                    <SelectItem value="DISPOSED">{MAINT_RESULT_LABELS.DISPOSED}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>วันที่ดำเนินการ</Label>
              <Input
                type="date"
                value={performedAt}
                onChange={(e) => setPerformedAt(e.target.value)}
                className="bg-card"
              />
            </div>

            {type === "CORRECTIVE" && (
              <div className="space-y-2">
                <Label>ปัญหา/อาการ</Label>
                <Input
                  value={issue}
                  onChange={(e) => setIssue(e.target.value)}
                  placeholder="เสียอะไร?"
                  className="bg-card"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>รายละเอียดงานที่ทำ</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="งานที่ดำเนินการ..."
                rows={2}
                className="bg-card"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>ค่าใช้จ่าย (฿)</Label>
                <Input
                  type="number"
                  min={0}
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0"
                  className="bg-card"
                />
              </div>
              <div className="space-y-2">
                <Label>นัดครั้งถัดไป</Label>
                <Input
                  type="date"
                  value={nextMaintenanceAt}
                  onChange={(e) => setNextOverride(e.target.value)}
                  disabled={!schedulesNext}
                  className="bg-card"
                />
                {schedulesNext
                  ? cycle > 0 && nextMaintenanceAt && (
                      <span className="text-[11px] text-muted-foreground">คำนวณอัตโนมัติ: +{cycle} เดือน</span>
                    )
                  : (
                      <span className="text-[11px] text-muted-foreground">
                        {result === "DISPOSED" ? "ตัดจำหน่ายแล้ว — ไม่นัดรอบถัดไป" : "ยังซ่อมไม่เสร็จ — ยังอยู่ในรายการเลยรอบ"}
                      </span>
                    )}
              </div>
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
