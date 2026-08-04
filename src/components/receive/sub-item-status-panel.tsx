"use client";

import { useState, useCallback, useEffect } from "react";
import { fmtDate, TH_DATE, TH_DATETIME, TH_DAY } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Loader2, MapPin, Pencil, RotateCcw, Search, Send, Undo2, Wrench } from "lucide-react";
import { pic } from "@/lib/image";
import { getSubItemsByStatus, updateItemStatus, type SubItemByStatus } from "@/lib/api";
import { effectiveCode, locationLabel } from "@/lib/constants";
import { MaintenanceFormDialog } from "@/components/items/maintenance-form-dialog";
import { FileUpload } from "@/components/shared/file-upload";
import { useSession } from "@/components/layout/auth-guard";

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const fmtDay = (iso: string) => fmtDate(iso, TH_DATE);
// "23 ก.ค. 2569 · 7 วัน" — the card row and the receive dialog show the same line.
const sentAtLabel = (iso: string) => `${fmtDay(iso)} · ${daysSince(iso) === 0 ? "วันนี้" : `${daysSince(iso)} วัน`}`;

// [badge label, badge classes, bare label for label:value lists]
const VENUE_BADGE = {
  EXTERNAL: ["ส่งซ่อมภายนอก", "bg-purple-500/10 text-purple-700", "ภายนอก"],
  INTERNAL: ["ส่งซ่อมภายใน", "bg-sky-500/10 text-sky-700", "ภายใน"],
  NONE: ["ไม่ระบุที่ซ่อม", "bg-muted text-muted-foreground", "ไม่ระบุ"],
} as const;

// ภายใน / ภายนอก toggle — shared by send-to-repair and the edit-repair-details dialog.
function VenuePicker({ value, onChange }: { value: "INTERNAL" | "EXTERNAL" | ""; onChange: (v: "INTERNAL" | "EXTERNAL") => void }) {
  return (
    <div className="flex gap-2">
      {([["INTERNAL", "ภายใน"], ["EXTERNAL", "ภายนอก"]] as const).map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={
            "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors " +
            (value === v
              ? "border-primary bg-primary/10 text-primary font-medium"
              : "border-border bg-card text-muted-foreground hover:text-foreground")
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Generic "receive back" panel for per-unit sub-items in a fixed status
// (IN_USE = placed in a room, UNDER_REPAIR = sent for repair, DAMAGED = reported
// damaged, awaiting a send-to-repair decision). Action target varies:
// IN_USE/UNDER_REPAIR flip → AVAILABLE, DAMAGED flips → UNDER_REPAIR (ส่งซ่อม).
// UI mirrors ReturnPanel (search bar + summary count + card style) — no due-date
// chips here since none of these statuses are loans with a due date.
export function SubItemStatusPanel({
  status,
  actionLabel,
  emptyText,
}: {
  status: "IN_USE" | "UNDER_REPAIR" | "DAMAGED";
  actionLabel: string;
  emptyText: string;
}) {
  const [rows, setRows] = useState<SubItemByStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSubItemsByStatus(status);
      setRows(data.subItems);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          {status === "UNDER_REPAIR" ? <Wrench className="h-6 w-6 text-muted-foreground" /> : status === "DAMAGED" ? <Send className="h-6 w-6 text-muted-foreground" /> : <RotateCcw className="h-6 w-6 text-muted-foreground" />}
        </div>
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filteredRows = q
    ? rows.filter((r) => {
        const loc = r.location ?? r.item.location;
        return (
          r.item.name.toLowerCase().includes(q) ||
          r.item.code.toLowerCase().includes(q) ||
          r.subCode.toLowerCase().includes(q) ||
          (loc ? locationLabel(loc).toLowerCase().includes(q) : false)
        );
      })
    : rows;

  return (
    <Card className="flex flex-col max-h-full min-h-0 overflow-hidden">
      <CardContent className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="shrink-0 space-y-2 sm:space-y-3">
          <p className="text-xs text-muted-foreground">{filteredRows.length} รายการ</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาชื่อพัสดุ / รหัส / สถานที่…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-9 text-sm"
            />
          </div>
          <Separator />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pb-2">
          {filteredRows.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">ไม่พบ &ldquo;{query}&rdquo;</p>
          ) : (
            filteredRows.map((r) => (
              <StatusRow key={r.id} row={r} status={status} actionLabel={actionLabel} onResolved={load} />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusRow({ row, status, actionLabel, onResolved }: { row: SubItemByStatus; status: "IN_USE" | "UNDER_REPAIR" | "DAMAGED"; actionLabel: string; onResolved: () => void }) {
  const { user } = useSession();
  const isAdmin = user?.role === "ADMIN";
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [maintOpen, setMaintOpen] = useState(false);
  const [editRepairOpen, setEditRepairOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [note, setNote] = useState("");
  const [repairNote, setRepairNote] = useState("");
  // อาการที่ชำรุด as it stands for this trip — editable, because the first report is often
  // written before anyone has looked at the piece properly.
  const [damage, setDamage] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [venue, setVenue] = useState<"INTERNAL" | "EXTERNAL" | "">("");
  const isRepair = status === "UNDER_REPAIR";
  const isDamaged = status === "DAMAGED";
  // DAMAGED → UNDER_REPAIR (ส่งซ่อม); IN_USE/UNDER_REPAIR → AVAILABLE (รับเข้า).
  const targetStatus = isDamaged ? "UNDER_REPAIR" : "AVAILABLE";
  // Prefer the piece's own location; fall back to the spec's location when unset.
  const loc = row.location ?? row.item.location;

  const reset = () => {
    setNote("");
    setRepairNote("");
    setDamage("");
    setPhotoUrl(null);
    setVenue("");
  };

  const save = async (body: Parameters<typeof updateItemStatus>[1], successMsg = "บันทึกเรียบร้อย") => {
    setSaving(true);
    try {
      await updateItemStatus(row.item.id, { ...body, subItemId: row.id });
      toast.success(successMsg);
      reset();
      onResolved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const receive = () =>
    save({
      newStatus: targetStatus,
      notes: isDamaged ? note.trim() : undefined,
      imageUrl: isDamaged ? (photoUrl ?? undefined) : undefined,
      repairVenue: isDamaged && venue ? venue : undefined,
      repairNote: isDamaged ? repairNote.trim() : undefined,
      // The ส่งซ่อม note IS the symptom this trip is about — stamp it on the row so later
      // edits have something to correct instead of reading it back out of `reason`.
      damageNote: isDamaged ? note.trim() : undefined,
    });

  // Still ส่งซ่อม, only the repair details change (ซ่อมภายในไม่ได้ → ส่งภายนอกต่อ). Writes a
  // fresh UNDER_REPAIR → UNDER_REPAIR log row so the trail shows both trips, not just the last.
  const editRepair = () =>
    save({
      newStatus: "UNDER_REPAIR",
      notes: `แก้ข้อมูลการส่งซ่อม${repairNote.trim() ? ` · ${repairNote.trim()}` : ""}`,
      repairVenue: venue || undefined,
      repairNote: repairNote.trim() || undefined,
      damageNote: damage.trim() || undefined,
    }, "แก้ข้อมูลการส่งซ่อมแล้ว");

  // ADMIN only — the piece turned out not to be broken, so the ชำรุด report is withdrawn.
  const cancelDamage = () =>
    save({ newStatus: "AVAILABLE", notes: `ยกเลิกคำขอชำรุด · ${note.trim()}` }, "ยกเลิกคำขอชำรุดแล้ว");

  return (
    <Card className="border shadow-none py-2.5">
      <CardContent>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center">
              <img src={row.item.imageUrl ?? pic(row.item.code, 176)} alt={row.item.name} loading="lazy" className="size-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm leading-snug">{row.item.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{effectiveCode(row.item.code, row.subCode, row.item._count.subItems)}</p>
              {/* Repair tab trades location/ชำรุด for the repair trip itself — venue, detail,
                  and how long it's been out. Older logs have no venue/repairNote, so the
                  ชำรุด reason stands in as the detail. */}
              {isRepair ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground mt-1">
                  <span className={"inline-flex items-center rounded-full px-1.5 py-0 font-medium " + VENUE_BADGE[row.repairVenue ?? "NONE"][1]}>
                    {VENUE_BADGE[row.repairVenue ?? "NONE"][0]}
                  </span>
                  {(row.repairNote ?? row.damageNote) && <span className="text-foreground">{row.repairNote ?? row.damageNote}</span>}
                  {row.repairSentAt && (
                    <>
                      <span className="text-border">│</span>
                      <span>ส่งซ่อม {sentAtLabel(row.repairSentAt)}</span>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                  {loc && (
                    <span className="inline-flex items-center gap-1"><MapPin className="size-3 text-primary/80" />{locationLabel(loc)}</span>
                  )}
                  {row.damageNote && <span>ชำรุด: <span className="text-foreground">{row.damageNote}</span></span>}
                  {row.notes && <span>หมายเหตุ: <span className="text-foreground">{row.notes}</span></span>}
                </div>
              )}
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
            {/* Secondary action on the repair/damage cards — shown left of the primary button. */}
            {isRepair && (
              <Button
                size="sm"
                variant="outline"
                className="h-9 w-full sm:w-auto"
                disabled={saving}
                // Editing, not re-entering: start from what's on record so a small correction
                // doesn't mean retyping the venue and the whole note.
                onClick={() => {
                  setVenue(row.repairVenue ?? "");
                  setRepairNote(row.repairNote ?? "");
                  setDamage(row.damageNote ?? "");
                  setEditRepairOpen(true);
                }}
              >
                <Pencil className="size-3.5" />แก้ข้อมูลส่งซ่อม
              </Button>
            )}
            {isDamaged && isAdmin && (
              <Button size="sm" variant="outline" className="h-9 w-full sm:w-auto" disabled={saving} onClick={() => setCancelOpen(true)}>
                <Undo2 className="size-3.5" />ยกเลิกคำขอชำรุด
              </Button>
            )}
            <Button
              size="sm"
              className="h-9 w-full sm:w-auto"
              disabled={saving}
              onClick={() => (isRepair ? setMaintOpen(true) : setConfirmOpen(true))}
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : isRepair ? <Wrench className="size-3.5" /> : isDamaged ? <Send className="size-3.5" /> : <RotateCcw className="size-3.5" />}
              {actionLabel}
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Return-from-use / send-to-repair: simple confirm (no cost, just a status flip + log). */}
      {!isRepair && (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ยืนยันการ{actionLabel}</AlertDialogTitle>
              <AlertDialogDescription>
                {isDamaged ? (
                  <>ส่ง <span className="font-medium text-foreground">{row.item.name}</span> ไปซ่อม เมื่อซ่อมเสร็จ กรุณากด &ldquo;รับคืนจากส่งซ่อม&rdquo; ที่หน้ารับเข้า-คืนพัสดุ</>
                ) : (
                  <>บันทึก <span className="font-medium text-foreground">{row.item.name}</span> ({effectiveCode(row.item.code, row.subCode, row.item._count.subItems)}) เป็น &ldquo;พร้อมใช้งาน&rdquo; ทันที — รายการนี้จะเข้าประวัติ ไม่สามารถแก้ไขย้อนหลังได้</>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {isDamaged && (
              // Direct child of AlertDialogContent (not Header) so the separator's
              // -mx-4 reaches both dialog edges (Header is a centered grid → clips).
              <div className="w-full space-y-3 text-left">
                <div className="-mx-4"><Separator /></div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground" required>
                    ระบุรายละเอียดการชำรุด
                  </Label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="เช่น จอแตก ปุ่มหลุด สายชาร์จขาด…"
                    rows={2}
                    className="bg-card"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground" required>
                    รายละเอียดการส่งซ่อม
                  </Label>
                  <Textarea
                    value={repairNote}
                    onChange={(e) => setRepairNote(e.target.value)}
                    placeholder="เช่น ส่งซ่อมร้าน ABC…"
                    rows={2}
                    className="bg-card"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground" required>ส่งซ่อมที่</Label>
                  <VenuePicker value={venue} onChange={setVenue} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">รูปหลักฐานก่อนส่ง (ถ้ามี)</Label>
                  <FileUpload value={photoUrl} onChange={setPhotoUrl} accept="image/*" label="อัปโหลดรูป" />
                </div>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction disabled={isDamaged && (!note.trim() || !repairNote.trim() || !venue)} onClick={() => { setConfirmOpen(false); receive(); }}>ยืนยัน</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Return-from-repair: full maintenance form so the result + cost are logged. */}
      {isRepair && (
        <MaintenanceFormDialog
          open={maintOpen}
          onOpenChange={setMaintOpen}
          itemId={row.item.id}
          itemLabel={row.item.name}
          subItemId={row.id}
          subItemLabel={effectiveCode(row.item.code, row.subCode, row.item._count.subItems)}
          maintenanceCycleMonths={row.item.maintenanceCycleMonths}
          fromRepair
          repairInfo={{
            damage: row.damageNote,
            venue: VENUE_BADGE[row.repairVenue ?? "NONE"][2],
            note: row.repairNote,
            sentAt: row.repairSentAt && sentAtLabel(row.repairSentAt),
          }}
          onSuccess={onResolved}
        />
      )}

      {/* Repair details changed mid-repair (ซ่อมภายในไม่ได้ → ส่งภายนอก). Status stays ส่งซ่อม. */}
      {isRepair && (
        <AlertDialog open={editRepairOpen} onOpenChange={setEditRepairOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>แก้ข้อมูลการส่งซ่อม</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-medium text-foreground">{row.item.name}</span> ยังอยู่ระหว่างส่งซ่อมเหมือนเดิม — แก้เฉพาะข้อมูลการส่งซ่อม ระบบจะบันทึกเป็นประวัติเพิ่ม ไม่ทับของเดิม
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="w-full space-y-3 text-left">
              <div className="-mx-4"><Separator /></div>
              {/* When the trip started is a fact, not an edit — the rest of the card is. */}
              <dl className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
                <div className="flex gap-2">
                  <dt className="shrink-0 text-muted-foreground">วันที่ส่งซ่อม:</dt>
                  <dd className="min-w-0 text-foreground">{(row.repairSentAt && sentAtLabel(row.repairSentAt)) || "—"}</dd>
                </div>
              </dl>
              {/* Editable: the first ชำรุด report is usually written before anyone opened the
                  piece up, so the symptom is the thing that most often turns out wrong. */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground" required>อาการที่ชำรุด</Label>
                <Textarea
                  value={damage}
                  onChange={(e) => setDamage(e.target.value)}
                  placeholder="เช่น จอไม่ติด กดปุ่มแล้วไม่ตอบสนอง…"
                  rows={2}
                  className="bg-card"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground" required>ส่งซ่อมที่</Label>
                <VenuePicker value={venue} onChange={setVenue} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground" required>รายละเอียดการส่งซ่อม</Label>
                <Textarea
                  value={repairNote}
                  onChange={(e) => setRepairNote(e.target.value)}
                  placeholder="เช่น ซ่อมภายในไม่ได้ ส่งต่อร้าน ABC…"
                  rows={2}
                  className="bg-card"
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={reset}>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction disabled={!venue || !repairNote.trim() || !damage.trim()} onClick={() => { setEditRepairOpen(false); editRepair(); }}>บันทึก</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* ADMIN-only withdrawal of a ชำรุด report — the only step a role is allowed to undo. */}
      {isDamaged && isAdmin && (
        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ยกเลิกคำขอชำรุด</AlertDialogTitle>
              <AlertDialogDescription>
                คืน <span className="font-medium text-foreground">{row.item.name}</span> กลับเป็น &ldquo;พร้อมใช้งาน&rdquo; — ใช้เมื่อแจ้งชำรุดผิดหรือตรวจแล้วของไม่ได้เสีย
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="w-full space-y-3 text-left">
              <div className="-mx-4"><Separator /></div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground" required>เหตุผลที่ยกเลิก</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="เช่น ตรวจแล้วใช้งานได้ปกติ แจ้งผิดชิ้น…"
                  rows={2}
                  className="bg-card"
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={reset}>ปิด</AlertDialogCancel>
              <AlertDialogAction disabled={!note.trim()} onClick={() => { setCancelOpen(false); cancelDamage(); }}>ยืนยันยกเลิก</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  );
}
