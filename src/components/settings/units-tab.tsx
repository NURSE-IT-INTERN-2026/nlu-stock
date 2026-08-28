"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Ruler, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DIALOG_SHELL_FIT,
  DIALOG_BODY,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getUnits, createUnit, updateUnit, deleteUnit } from "@/lib/api";
import type { UnitRow } from "@/lib/api";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/shared/pagination";
import { useClientPage } from "@/hooks/use-client-page";
import { PAGE_SIZE } from "@/lib/pagination-constants";

function UnitRowTr({ unit, onEdit, onDelete }: { unit: UnitRow; onEdit: (u: UnitRow) => void; onDelete: (u: UnitRow) => void }) {
  const items = unit._count?.items ?? 0;
  const kits = unit._count?.kitBomItems ?? 0;
  return (
    <TableRow>
      <TableCell className="px-2"><span className="block truncate font-medium">{unit.name}</span></TableCell>
      <TableCell className={cn("text-xs px-2 tabular-nums", items === 0 && "text-muted-foreground")}>{items}</TableCell>
      <TableCell className={cn("text-xs px-2 tabular-nums", kits === 0 && "text-muted-foreground")}>{kits}</TableCell>
      <TableCell className="px-2">
        <TooltipProvider>
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => onEdit(unit)} aria-label="แก้ไข" />}>
                <Pencil className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>แก้ไข</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => onDelete(unit)} aria-label="ลบ" />}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </TooltipTrigger>
              <TooltipContent>ลบ</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );
}

export function UnitsTab() {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UnitRow | null>(null);
  const [name, setName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<UnitRow | null>(null);
  const { page, setPage, paged, total } = useClientPage(units, PAGE_SIZE.DEFAULT);

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const fetchUnits = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUnits();
      setUnits(data);
    } catch {
      toast.error("โหลดข้อมูลไม่สำเร็จ");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  function openCreate() {
    setEditing(null);
    setName("");
    setDialogOpen(true);
  }

  function openEdit(unit: UnitRow) {
    setEditing(unit);
    setName(unit.name);
    setDialogOpen(true);
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;

    // ponytail: close the dialog before awaiting so the button can't be double-fired on a slow request.
    setDialogOpen(false);
    try {
      if (editing) {
        await updateUnit(editing.id, { name: trimmed });
        toast.success("อัปเดตหน่วยสำเร็จ");
      } else {
        await createUnit({ name: trimmed });
        toast.success("เพิ่มหน่วยสำเร็จ");
      }
      fetchUnits();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      if (editing) openEdit(editing);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteUnit(id);
      toast.success("ลบหน่วยสำเร็จ");
      fetchUnits();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-8 w-16" />
      </div>
      <div className="rounded-2xl border overflow-hidden bg-card">
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Modal shell elements (shared by Dialog + Sheet) ──────────
  const title = editing ? "แก้ไขหน่วยนับ" : "เพิ่มหน่วยนับ";
  const subtitle = editing ? "แก้ไขชื่อหน่วยนับ" : "เพิ่มหน่วยนับใหม่";

  const modalHeader = (
    <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Ruler className="h-4 w-4" />
        </div>
        <div>
          <p className="text-base font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <button
        onClick={() => setDialogOpen(false)}
        className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        aria-label="ปิด"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  const modalBody = (
    <div className={cn(DIALOG_BODY, "bg-secondary/40 px-6 py-6")}>
      <div className="space-y-4">
        <div>
          <Label htmlFor="unit-name">ชื่อหน่วยนับ</Label>
          <Input
            id="unit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            className="bg-card"
            placeholder="เช่น ชิ้น, กล่อง, เล่ม"
            autoFocus
          />
        </div>
      </div>
    </div>
  );

  const modalFooter = (
    <div className="flex items-center justify-between border-t border-border bg-card px-6 py-4">
      <Button variant="ghost" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
      <Button onClick={handleSave} disabled={!name.trim()}>{editing ? "บันทึก" : "สร้าง"}</Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">หน่วยนับทั้งหมด {units.length} รายการ</p>
        <Button size="sm" onClick={openCreate} className="shrink-0"><Plus className="h-4 w-4 mr-1" />เพิ่มหน่วยนับ</Button>
      </div>

      <div className="rounded-2xl border overflow-hidden bg-card shadow-sm">
        <Table grid zebra className="table-fixed">
          <TableHeader sticky>
            <TableRow>
              <TableHead className="px-2">ชื่อหน่วยนับ</TableHead>
              <TableHead className="w-24 px-2">พัสดุ</TableHead>
              <TableHead className="w-24 px-2">รายการในชุด</TableHead>
              <TableHead className="w-[100px] px-2">การดำเนินการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-12">
                <div className="flex flex-col items-center gap-3 text-center">
                  <Ruler className="h-8 w-8 text-muted-foreground/40" />
                  <div>
                    <p className="text-sm font-medium text-foreground">ไม่มีหน่วยนับ</p>
                    <p className="text-xs text-muted-foreground mt-0.5">สร้างหน่วยนับเพื่อใช้กับพัสดุ</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />เพิ่มหน่วยนับ</Button>
                </div>
              </TableCell></TableRow>
            ) : paged.map((unit) => (
              <UnitRowTr key={unit.id} unit={unit} onEdit={openEdit} onDelete={setDeleteTarget} />
            ))}
          </TableBody>
        </Table>
        {units.length > 0 && (
          <Pagination page={page} total={total} pageSize={PAGE_SIZE.DEFAULT} onChange={setPage} unit="หน่วยนับ" />
        )}
      </div>

      {isDesktop ? (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md gap-0 overflow-hidden p-0 sm:rounded-2xl" showCloseButton={false}>
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <DialogDescription className="sr-only">{subtitle}</DialogDescription>
            <div className={DIALOG_SHELL_FIT}>
              {modalHeader}
              {modalBody}
              {modalFooter}
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
          <SheetContent side="bottom" className="h-[90vh] rounded-t-2xl gap-0 p-0 overflow-hidden" showCloseButton={false}>
            <SheetTitle className="sr-only">{title}</SheetTitle>
            <SheetDescription className="sr-only">{subtitle}</SheetDescription>
            <div className="flex h-full flex-col overflow-hidden">
              {modalHeader}
              {modalBody}
              {modalFooter}
            </div>
          </SheetContent>
        </Sheet>
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบหน่วยนับ</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && ((deleteTarget._count?.items ?? 0) + (deleteTarget._count?.kitBomItems ?? 0)) > 0 ? (
                <>
                  ลบ &ldquo;{deleteTarget.name}&rdquo; ไม่ได้ — มีการใช้งานอยู่:{" "}
                  พัสดุ {deleteTarget._count?.items ?? 0} รายการ
                  {(deleteTarget._count?.kitBomItems ?? 0) > 0 && `, รายการในชุด ${deleteTarget._count?.kitBomItems}`}
                </>
              ) : (
                <>ต้องการลบหน่วยนับ &ldquo;{deleteTarget?.name}&rdquo; ใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ปิด</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!!deleteTarget && ((deleteTarget._count?.items ?? 0) + (deleteTarget._count?.kitBomItems ?? 0)) > 0}
              onClick={handleConfirmDelete}
            >
              ลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
