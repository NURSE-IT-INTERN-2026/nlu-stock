"use client";

import { useState, useCallback, useEffect } from "react";
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
import { Loader2, MapPin, RotateCcw, Search, Send, Wrench } from "lucide-react";
import { pic } from "@/lib/image";
import { getSubItemsByStatus, updateItemStatus, type SubItemByStatus } from "@/lib/api";
import { formatSubCode, locationLabel } from "@/lib/constants";
import { MaintenanceFormDialog } from "@/components/items/maintenance-form-dialog";
import { FileUpload } from "@/components/shared/file-upload";

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
    ? rows.filter((r) =>
        r.item.name.toLowerCase().includes(q) ||
        r.item.code.toLowerCase().includes(q) ||
        r.subCode.toLowerCase().includes(q) ||
        (r.item.location ? locationLabel(r.item.location).toLowerCase().includes(q) : false),
      )
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
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [maintOpen, setMaintOpen] = useState(false);
  const [note, setNote] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const isRepair = status === "UNDER_REPAIR";
  const isDamaged = status === "DAMAGED";
  // DAMAGED → UNDER_REPAIR (ส่งซ่อม); IN_USE/UNDER_REPAIR → AVAILABLE (รับเข้า).
  const targetStatus = isDamaged ? "UNDER_REPAIR" : "AVAILABLE";

  const receive = async () => {
    setSaving(true);
    try {
      await updateItemStatus(row.item.id, {
        newStatus: targetStatus,
        subItemId: row.id,
        notes: isDamaged ? (note.trim() || undefined) : undefined,
        imageUrl: isDamaged ? (photoUrl ?? undefined) : undefined,
      });
      toast.success("บันทึกเรียบร้อย");
      setNote("");
      setPhotoUrl(null);
      onResolved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

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
              <p className="text-xs text-muted-foreground font-mono">{formatSubCode(row.item.code, row.subCode)}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                {row.item.location && (
                  <span className="inline-flex items-center gap-1"><MapPin className="size-3 text-primary/80" />{locationLabel(row.item.location)}</span>
                )}
                {row.notes && <span>หมายเหตุ: <span className="text-foreground">{row.notes}</span></span>}
              </div>
            </div>
          </div>
          <Button
            size="sm"
            className="h-9 w-full shrink-0 sm:w-auto"
            disabled={saving}
            onClick={() => (isRepair ? setMaintOpen(true) : setConfirmOpen(true))}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : isRepair ? <Wrench className="size-3.5" /> : isDamaged ? <Send className="size-3.5" /> : <RotateCcw className="size-3.5" />}
            {actionLabel}
          </Button>
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
                  <>ส่ง <span className="font-medium text-foreground">{row.item.name}</span> ไปซ่อม เมื่อซ่อมเสร็จ กรุณากด &ldquo;รับซ่อม&rdquo; ที่หน้ารับเข้า-คืนพัสดุ</>
                ) : (
                  <>บันทึก <span className="font-medium text-foreground">{row.item.name}</span> ({formatSubCode(row.item.code, row.subCode)}) เป็น &ldquo;พร้อมใช้งาน&rdquo; ทันที — รายการนี้จะเข้าประวัติ ไม่สามารถแก้ไขย้อนหลังได้</>
                )}
              </AlertDialogDescription>
              {isDamaged && (
                <div className="w-full space-y-3 pt-1 text-left">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">หมายเหตุ (ถ้ามี)</Label>
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="เช่น ส่งร้าน ABC ถนน…"
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">รูปหลักฐานก่อนส่ง (ถ้ามี)</Label>
                    <FileUpload value={photoUrl} onChange={setPhotoUrl} accept="image/*" label="อัปโหลดรูป" />
                  </div>
                </div>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setConfirmOpen(false); receive(); }}>ยืนยัน</AlertDialogAction>
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
          subItemLabel={formatSubCode(row.item.code, row.subCode)}
          onSuccess={onResolved}
        />
      )}
    </Card>
  );
}
