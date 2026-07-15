"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowLeft, Check, Minus, Plus, Camera, X, Save, Loader2, Calendar, ChevronDown,
} from "lucide-react";
import { pic } from "@/lib/image";
import { cn } from "@/lib/utils";
import {
  returnLoanEntries, returnItem, uploadFile,
  type OpenBorrow, type ReturnCondition,
} from "@/lib/api";
import { formatSubCode } from "@/lib/constants";

export interface LoanGroup {
  key: string;
  records: OpenBorrow[];
}

// Per-record count-return split. total = units returning now; damaged/lost carved out of it.
interface CountBucket {
  total: number;
  damaged: number;
  lost: number;
}
const emptyBucket: CountBucket = { total: 0, damaged: 0, lost: 0 };
const normalOf = (b: CountBucket) => Math.max(0, b.total - b.damaged - b.lost);

const CONDITION_OPTIONS: { value: ReturnCondition; label: string }[] = [
  { value: "AVAILABLE", label: "ปกติ" },
  { value: "DAMAGED", label: "ชำรุด" },
  { value: "LOST", label: "สูญหาย" },
];

// Tap-to-pick condition chips (shown once a SubItem is selected). Color = severity.
const COND_CHIP: Record<ReturnCondition, { active: string; idle: string }> = {
  AVAILABLE: { active: "bg-emerald-600 text-white border-emerald-600", idle: "text-emerald-700 border-emerald-200 hover:bg-emerald-50" },
  DAMAGED: { active: "bg-red-700 text-white border-red-700", idle: "text-red-700 border-red-200 hover:bg-red-50" },
  LOST: { active: "bg-slate-700 text-white border-slate-700", idle: "text-slate-600 border-slate-300 hover:bg-slate-50" },
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : null);
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

function dueAlert(dueAt: string | null): { text: string; cls: string } | null {
  if (!dueAt) return null;
  const days = (new Date(dueAt).getTime() - Date.now()) / 86400000;
  if (days < 0) return { text: "เกินกำหนด", cls: "bg-red-700 text-white hover:bg-red-700" };
  if (days <= 3) return { text: "ใกล้ครบกำหนด", cls: "bg-amber-600 text-white hover:bg-amber-600" };
  return null;
}

function outstandingOf(r: OpenBorrow) {
  return r.returnedAt ? 0 : r.quantity - r.resolvedQty;
}

export function ReturnLoanDetail({
  group,
  onBack,
  onResolved,
}: {
  group: LoanGroup;
  onBack: () => void;
  onResolved: () => void;
}) {
  const head = group.records[0];
  const recipient = head.recipient;
  const borrowed = fmtDate(head.dispensedAt);
  const due = fmtDate(head.dueAt);

  // Group records by item, then split tracked vs count within each item.
  const itemMap = new Map<string, OpenBorrow[]>();
  for (const r of group.records) {
    const arr = itemMap.get(r.item.id);
    if (arr) arr.push(r);
    else itemMap.set(r.item.id, [r]);
  }
  const items = [...itemMap.values()];

  // tracked selection state (keyed by dispense record id)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [conditions, setConditions] = useState<Record<string, ReturnCondition>>({});
  const [rowNotes, setRowNotes] = useState<Record<string, string>>({});
  const [rowPhotos, setRowPhotos] = useState<Record<string, string[]>>({});
  // count stepper state (keyed by dispense record id) = how many MORE to return now,
  // split by condition. normal = total − damaged − lost (derived).
  const [countBuckets, setCountBuckets] = useState<Record<string, CountBucket>>({});

  const [note, setNote] = useState("");
  const [proofs, setProofs] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const outstandingTotal = group.records.reduce((s, r) => s + outstandingOf(r), 0);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", f);
        const { url } = await uploadFile(fd);
        urls.push(url);
      }
      setProofs((p) => [...p, ...urls]);
    } catch {
      toast.error("อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  // Per-SubItem evidence upload (required when condition ≠ ปกติ).
  const handleRowFiles = async (id: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", f);
        const { url } = await uploadFile(fd);
        urls.push(url);
      }
      setRowPhotos((p) => ({ ...p, [id]: [...(p[id] ?? []), ...urls] }));
    } catch {
      toast.error("อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };
  const removeRowPhoto = (id: string, index: number) =>
    setRowPhotos((p) => ({ ...p, [id]: (p[id] ?? []).filter((_, i) => i !== index) }));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const cond = (id: string): ReturnCondition => conditions[id] ?? "AVAILABLE";

  const hasTrackedAction = selected.size > 0;
  const countActions = items
    .flatMap((rs) => rs.filter((r) => !r.subItem))
    .filter((r) => (countBuckets[r.id]?.total ?? 0) > 0);
  // Any count-return with damaged/lost units also demands transaction-level evidence.
  const countNeedsEvidence = countActions.some((r) => {
    const b = countBuckets[r.id] ?? emptyBucket;
    return b.damaged > 0 || b.lost > 0;
  });
  // Force evidence: any selected non-normal SubItem needs ≥1 photo,
  // and any damaged/lost count-return needs ≥1 overall photo.
  const missingEvidence =
    group.records.some(
      (r) => r.subItem && selected.has(r.id) && cond(r.id) !== "AVAILABLE" && (rowPhotos[r.id]?.length ?? 0) === 0,
    ) || (countNeedsEvidence && proofs.length === 0);
  const canSave = !saving && !uploading && !missingEvidence && (hasTrackedAction || countActions.length > 0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Summary for the confirm dialog — merges tracked (per-unit) + count-based returns.
  const trackedSelected = group.records.filter((r) => r.subItem && selected.has(r.id));
  const trackedDamaged = trackedSelected.filter((r) => cond(r.id) === "DAMAGED").length;
  const trackedLost = trackedSelected.filter((r) => cond(r.id) === "LOST").length;
  const countDamaged = countActions.reduce((s, r) => s + (countBuckets[r.id]?.damaged ?? 0), 0);
  const countLost = countActions.reduce((s, r) => s + (countBuckets[r.id]?.lost ?? 0), 0);
  const countTotal = countActions.reduce((s, r) => s + (countBuckets[r.id]?.total ?? 0), 0);
  const totalReturning = trackedSelected.length + countTotal;
  const totalDamaged = trackedDamaged + countDamaged;
  const totalLost = trackedLost + countLost;
  const totalNormal = Math.max(0, totalReturning - totalDamaged - totalLost);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const proofUrls = proofs.length > 0 ? proofs : undefined;
      // 1. tracked entries
      const entries = group.records
        .filter((r) => r.subItem && selected.has(r.id))
        .map((r) => ({
          dispenseRecordId: r.id,
          subItemId: r.subItem!.id,
          status: cond(r.id),
          note: rowNotes[r.id]?.trim() || undefined,
          photos: rowPhotos[r.id]?.length ? rowPhotos[r.id] : undefined,
        }));
      if (entries.length > 0) {
        await returnLoanEntries({ entries, note: note.trim() || null, proofUrls });
      }
      // 2. count returns — one call per non-zero condition bucket, all against the
      //    same dispense record (backend tracks resolvedQty cumulatively).
      for (const r of countActions) {
        const b = countBuckets[r.id] ?? emptyBucket;
        const normal = normalOf(b);
        const legs = [
          { status: "AVAILABLE" as ReturnCondition, quantity: normal },
          { status: "DAMAGED" as ReturnCondition, quantity: b.damaged },
          { status: "LOST" as ReturnCondition, quantity: b.lost },
        ].filter((l) => l.quantity > 0);
        for (const leg of legs) {
          await returnItem(r.item.id, {
            dispenseRecordId: r.id,
            quantity: leg.quantity,
            status: leg.status,
            note: note.trim() || null,
            proofUrls,
          });
        }
      }
      toast.success("บันทึกการคืนเรียบร้อย");
      onResolved();
      onBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto min-h-0 px-1 pb-24">
        {/* Header */}
        <div className="pt-1">
          <button
            type="button"
            onClick={onBack}
            className="mb-3 -ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            กลับ
          </button>
          <h2 className="text-lg font-semibold leading-tight">{recipient ?? "ไม่ระบุชื่อผู้ยืม"}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> ยืม {borrowed}{borrowed ? ` · ${daysSince(head.dispensedAt)} วันที่แล้ว` : ""}
            </span>
            {due && <span>กำหนดคืน {due}</span>}
            {dueAlert(head.dueAt) && (
              <Badge className={`text-xs ${dueAlert(head.dueAt)!.cls}`}>{dueAlert(head.dueAt)!.text}</Badge>
            )}
          </div>
        </div>

        <Separator className="my-4" />

        {/* Per-item cards */}
        <div className="space-y-3">
          {items.map((rs) => {
            const item = rs[0].item;
            const tracked = rs.filter((r) => r.subItem);
            const countRec = rs.find((r) => !r.subItem);
            const isTracked = tracked.length > 0;
            return (
              <Card key={item.id} className="border shadow-none">
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                      <img src={item.imageUrl ?? pic(item.code, 192)} alt={item.name} loading="lazy" className="size-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium leading-tight truncate">{item.name}</h3>
                      <p className="text-xs text-muted-foreground font-mono">{item.code}</p>
                    </div>
                    <ItemBadge records={rs} />
                  </div>

                  {isTracked ? (
                    <TrackedRows
                      records={tracked}
                      selected={selected}
                      conditions={conditions}
                      rowNotes={rowNotes}
                      rowPhotos={rowPhotos}
                      uploading={uploading}
                      onToggle={toggle}
                      onCond={(id, c) => setConditions((p) => ({ ...p, [id]: c }))}
                      onNote={(id, v) => setRowNotes((p) => ({ ...p, [id]: v }))}
                      onUpload={(id, files) => handleRowFiles(id, files)}
                      onRemovePhoto={(id, i) => removeRowPhoto(id, i)}
                      onSelectAll={() => {
                        const openIds = tracked.filter((r) => !r.returnedAt).map((r) => r.id);
                        const allOpenSelected = openIds.every((id) => selected.has(id));
                        setSelected((prev) => {
                          const next = new Set(prev);
                          openIds.forEach((id) => (allOpenSelected ? next.delete(id) : next.add(id)));
                          return next;
                        });
                      }}
                    />
                  ) : countRec ? (
                    <CountStepper
                      record={countRec}
                      bucket={countBuckets[countRec.id] ?? emptyBucket}
                      onChange={(b) => setCountBuckets((p) => ({ ...p, [countRec.id]: b }))}
                    />
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Separator className="my-4" />

        {/* Overall note + photo (transaction-level) */}
        <Card className="border shadow-none">
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">หมายเหตุการคืนโดยรวม (ถ้ามี)</Label>
              <Input placeholder="เช่น คืนล่าช้าเพราะนักเรียนป่วย" value={note} onChange={(e) => setNote(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">รูปภาพรวมการคืน (ถ้ามี)</Label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {proofs.map((url, i) => (
                  <div key={url + i} className="group relative aspect-square overflow-hidden rounded-md border">
                    <img src={url} alt={`หลักฐาน ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setProofs((p) => p.filter((_, idx) => idx !== i))}
                      className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-100 shadow transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label="ลบรูป"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                  เพิ่มรูป
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 md:left-[var(--sidebar-w)] right-0 z-[60] border-t bg-card flex items-center justify-between gap-3 p-3">
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium truncate">{outstandingTotal === 0 ? "คืนครบทุกชิ้น" : `ยังค้าง ${outstandingTotal} ชิ้น`}</div>
          <div className="text-xs text-muted-foreground truncate">
            {missingEvidence
              ? <span className="text-destructive">ต้องแนบรูปหลักฐานชิ้นที่ชำรุด/สูญหาย</span>
              : `หลักฐาน ${proofs.length + Object.values(rowPhotos).reduce((s, a) => s + a.length, 0)} รูป`}
          </div>
        </div>
        <Button onClick={() => setConfirmOpen(true)} disabled={!canSave} className="gap-1.5 shrink-0">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          บันทึก
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการบันทึกคืน</AlertDialogTitle>
            <AlertDialogDescription>
              จะบันทึกคืน <span className="font-medium text-foreground">{totalReturning} ชิ้น</span>
              {" "}(ปกติ {totalNormal}
              {totalDamaged > 0 && `, ชำรุด ${totalDamaged}`}
              {totalLost > 0 && `, สูญหาย ${totalLost}`}) เข้าประวัติถาวร ไม่สามารถแก้ไขย้อนหลังได้ ยืนยันบันทึกหรือไม่?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); save(); }}>ยืนยันบันทึก</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ItemBadge({ records }: { records: OpenBorrow[] }) {
  const total = records.reduce((s, r) => s + r.quantity, 0);
  const outstanding = records.reduce((s, r) => s + outstandingOf(r), 0);
  if (outstanding === 0)
    return (
      <Badge variant="secondary" className="gap-1 shrink-0">
        <Check className="h-3 w-3" /> คืนครบ
      </Badge>
    );
  return <Badge className="text-xs shrink-0 bg-red-700 text-white font-semibold hover:bg-red-700">ค้าง {outstanding}/{total}</Badge>;
}

function TrackedRows({
  records, selected, conditions, rowNotes, rowPhotos, uploading, onToggle, onCond, onNote, onUpload, onRemovePhoto, onSelectAll,
}: {
  records: OpenBorrow[];
  selected: Set<string>;
  conditions: Record<string, ReturnCondition>;
  rowNotes: Record<string, string>;
  rowPhotos: Record<string, string[]>;
  uploading: boolean;
  onToggle: (id: string) => void;
  onCond: (id: string, c: ReturnCondition) => void;
  onNote: (id: string, v: string) => void;
  onUpload: (id: string, files: FileList | null) => void;
  onRemovePhoto: (id: string, index: number) => void;
  onSelectAll: () => void;
}) {
  const code = records[0].item.code;
  const open = records.filter((r) => !r.returnedAt);
  const anyOpenOutstanding = open.length > 0;
  const allOpenSel = anyOpenOutstanding && open.every((r) => selected.has(r.id));
  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {records.map((r) => {
          const done = !!r.returnedAt;
          const isSel = selected.has(r.id);
          const c = conditions[r.id] ?? "AVAILABLE";
          const condLabel = CONDITION_OPTIONS.find((o) => o.value === c)?.label;
          return (
            <div key={r.id} className={cn("rounded-lg border overflow-hidden", !done && isSel && c !== "AVAILABLE" && "bg-red-50")}>
              <button
                type="button"
                disabled={done}
                onClick={() => onToggle(r.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.04] disabled:opacity-100 disabled:hover:bg-transparent"
              >
                <Checkbox checked={done || isSel} disabled={done} tabIndex={-1} className="pointer-events-none" />
                <div className="min-w-0 flex-1">
                  {r.subItem!.name && <p className="text-sm truncate">{r.subItem!.name}</p>}
                  <span className="font-mono text-xs text-muted-foreground truncate">{formatSubCode(code, r.subItem!.subCode)}</span>
                </div>
                {done ? (
                  <Badge variant="secondary" className="gap-1 text-xs"><Check className="h-3 w-3" /> คืนแล้ว</Badge>
                ) : (
                  <>
                    {isSel && (
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", COND_CHIP[c].active)}>{condLabel}</span>
                    )}
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isSel && "rotate-180")} />
                  </>
                )}
              </button>
              {isSel && !done && (
                <div className="px-3 pb-3 pt-3 space-y-2 border-t border-border/60">
                  <div className="flex flex-wrap gap-1.5">
                    {CONDITION_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => onCond(r.id, o.value)}
                        className={cn(
                          "px-2.5 py-1.5 rounded-md text-xs border transition-colors",
                          c === o.value ? COND_CHIP[o.value].active : COND_CHIP[o.value].idle,
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {c !== "AVAILABLE" && (
                    <>
                      <Input
                        placeholder={c === "DAMAGED" ? "ระบุความเสียหาย เช่น จอแตก" : "ระบุรายละเอียดการสูญหาย"}
                        value={rowNotes[r.id] ?? ""}
                        onChange={(e) => onNote(r.id, e.target.value)}
                        className="h-9 text-sm"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        {(rowPhotos[r.id] ?? []).map((url, i) => (
                          <div key={url + i} className="group relative size-12 overflow-hidden rounded-md border">
                            <img src={url} alt={`หลักฐาน ${i + 1}`} className="size-full object-cover" />
                            <button
                              type="button"
                              onClick={() => onRemovePhoto(r.id, i)}
                              className="absolute right-0 top-0 rounded-bl-md bg-background/90 p-0.5 opacity-100 shadow transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                              aria-label="ลบรูป"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <label className={cn("flex size-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed text-[10px] text-muted-foreground transition-colors hover:border-primary hover:text-primary", uploading && "pointer-events-none opacity-50")}>
                          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                          แนบรูป
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => { onUpload(r.id, e.target.files); e.target.value = ""; }}
                          />
                        </label>
                      </div>
                      <p className="text-[10px] text-muted-foreground">แนบรูปหลักฐาน (บังคับสำหรับ{c === "DAMAGED" ? "ชำรุด" : "สูญหาย"})</p>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {anyOpenOutstanding && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onSelectAll}>
            {allOpenSel ? "ยกเลิกเลือกทั้งหมด" : "ทำเครื่องหมายคืนทั้งหมด"}
          </Button>
        </div>
      )}
    </div>
  );
}

function CountStepper({ record, bucket, onChange }: { record: OpenBorrow; bucket: CountBucket; onChange: (b: CountBucket) => void }) {
  const outstanding = outstandingOf(record);
  const alreadyReturned = record.resolvedQty;
  const normal = normalOf(bucket);

  // Keep buckets internally consistent when any leg changes.
  const setTotal = (v: number) => {
    const total = Math.max(0, Math.min(outstanding, v));
    // Clamp damaged/lost so they never exceed the new total.
    const damaged = Math.min(bucket.damaged, total);
    const lost = Math.min(bucket.lost, total - damaged);
    onChange({ total, damaged, lost });
  };
  const setDamaged = (v: number) => {
    const damaged = Math.max(0, Math.min(bucket.total - bucket.lost, v));
    onChange({ ...bucket, damaged });
  };
  const setLost = (v: number) => {
    const lost = Math.max(0, Math.min(bucket.total - bucket.damaged, v));
    onChange({ ...bucket, lost });
  };
  const toggleDamaged = () => onChange(bucket.damaged > 0 ? { ...bucket, damaged: 0 } : { ...bucket, damaged: 1 });
  const toggleLost = () => onChange(bucket.lost > 0 ? { ...bucket, lost: 0 } : { ...bucket, lost: 1 });

  return (
    <div className="space-y-3">
      {/* Main: how many units are coming back now */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setTotal(bucket.total - 1)} disabled={bucket.total === 0}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <div className="min-w-[7rem] text-center text-sm">
            <span className="font-semibold">{alreadyReturned + bucket.total}</span>
            <span className="text-muted-foreground"> / {record.quantity} คืนแล้ว</span>
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setTotal(bucket.total + 1)} disabled={bucket.total >= outstanding}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button size="sm" variant="outline" className="h-9" onClick={() => setTotal(outstanding)} disabled={outstanding === 0}>
          คืนทั้งหมด
        </Button>
      </div>

      {/* Condition toggles — only meaningful once something is being returned */}
      {bucket.total > 0 && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-2.5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleDamaged}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                bucket.damaged > 0
                  ? "bg-red-700 text-white border-red-700"
                  : "border-dashed border-red-300 text-red-700 hover:bg-red-50",
              )}
            >
              {bucket.damaged > 0 ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              มีของชำรุด
            </button>
            <button
              type="button"
              onClick={toggleLost}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                bucket.lost > 0
                  ? "bg-slate-700 text-white border-slate-700"
                  : "border-dashed border-slate-300 text-slate-600 hover:bg-slate-50",
              )}
            >
              {bucket.lost > 0 ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              มีของสูญหาย
            </button>
          </div>
          {bucket.damaged === 0 && bucket.lost === 0 && (
            <p className="text-[11px] text-muted-foreground">แตะป้ายด้านบนถ้าของที่คืนมีชำรุดหรือสูญหายปะปนอยู่</p>
          )}

          {bucket.damaged > 0 && (
            <ConditionQtyRow label="ชำรุด" value={bucket.damaged} unit={record.item.issueUnit.name} onDec={() => setDamaged(bucket.damaged - 1)} onInc={() => setDamaged(bucket.damaged + 1)} />
          )}
          {bucket.lost > 0 && (
            <ConditionQtyRow label="สูญหาย" value={bucket.lost} unit={record.item.issueUnit.name} onDec={() => setLost(bucket.lost - 1)} onInc={() => setLost(bucket.lost + 1)} />
          )}

          {/* Live breakdown so staff can see how the total splits */}
          <p className="text-[11px] text-muted-foreground">
            ปกติ {normal} · ชำรุด {bucket.damaged} · สูญหาย {bucket.lost} {record.item.issueUnit.name}
          </p>
        </div>
      )}
    </div>
  );
}

function ConditionQtyRow({ label, value, unit, onDec, onInc }: { label: string; value: number; unit: string; onDec: () => void; onInc: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium">{label}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={onDec} disabled={value === 0}>
          <Minus className="h-3 w-3" />
        </Button>
        <span className="min-w-[3.5rem] text-center text-xs tabular-nums">{value} {unit}</span>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={onInc}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
