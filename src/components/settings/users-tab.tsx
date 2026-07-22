"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, UserCheck, UserX, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getSettingsUsers, createSettingsUser, updateSettingsUser, deleteSettingsUser } from "@/lib/api";
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

interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "ผู้ดูแล",
  STAFF: "เจ้าหน้าที่",
  INSTRUCTOR: "ผู้สอน",
  CHILDREN: "นักศึกษา",
};

export function UsersTab() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [form, setForm] = useState({ email: "", name: "", role: "STAFF" });
  const [deactivateTarget, setDeactivateTarget] = useState<UserRecord | null>(null);

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSettingsUsers();
      setUsers((data as { users?: UserRecord[] } & UserRecord[]).users || (data as UserRecord[]));
    } catch {
      toast.error("โหลดข้อมูลไม่สำเร็จ");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function openCreate() {
    setEditing(null);
    setForm({ email: "", name: "", role: "STAFF" });
    setDialogOpen(true);
  }

  function openEdit(user: UserRecord) {
    setEditing(user);
    setForm({ email: user.email, name: user.name, role: user.role });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      if (editing) {
        await updateSettingsUser(editing.id, { name: form.name, role: form.role });
        toast.success("อัปเดตผู้ใช้สำเร็จ");
      } else {
        await createSettingsUser(form);
        toast.success("สร้างผู้ใช้สำเร็จ");
      }
      setDialogOpen(false);
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }

  async function handleToggleActive(user: UserRecord) {
    try {
      await updateSettingsUser(user.id, { isActive: !user.isActive });
      toast.success(user.isActive ? "ปิดใช้งานผู้ใช้สำเร็จ" : "เปิดใช้งานผู้ใช้สำเร็จ");
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "อัปเดตไม่สำเร็จ");
    }
  }

  async function handleDelete(user: UserRecord) {
    setDeactivateTarget(user);
  }

  async function handleConfirmDeactivate() {
    if (!deactivateTarget) return;
    try {
      await deleteSettingsUser(deactivateTarget.id);
      toast.success("ปิดใช้งานผู้ใช้สำเร็จ");
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ปิดใช้งานไม่สำเร็จ");
    }
    setDeactivateTarget(null);
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-8 w-16" />
      </div>
      <div className="rounded-2xl border overflow-hidden bg-card">
        <div className="divide-y divide-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-7 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Modal shell elements (shared by Dialog + Sheet) ──────────
  const title = editing ? "แก้ไขผู้ใช้งาน" : "เพิ่มผู้ใช้งาน";
  const subtitle = editing ? "แก้ไขข้อมูลผู้ใช้งาน" : "เพิ่มผู้ใช้งานเข้าระบบ";
  const canSave = !form.email || !form.name;

  const modalHeader = (
    <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Users className="h-4 w-4" />
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
    <div className="flex-1 overflow-y-auto bg-secondary/40 px-6 py-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="user-email">อีเมล</Label>
          <Input
            id="user-email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            disabled={!!editing}
            type="email"
            className="bg-card"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-name">ชื่อ-นามสกุล</Label>
          <Input id="user-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-card" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-role">บทบาท</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v ?? "STAFF" })}>
            <SelectTrigger className="bg-card"><SelectValue>{ROLE_LABELS[form.role] ?? form.role}</SelectValue></SelectTrigger>
            <SelectContent>
              <SelectItem value="ADMIN">ผู้ดูแล</SelectItem>
              <SelectItem value="STAFF">เจ้าหน้าที่</SelectItem>
              <SelectItem value="INSTRUCTOR">ผู้สอน</SelectItem>
              <SelectItem value="CHILDREN">นักศึกษา</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  const modalFooter = (
    <div className="flex items-center justify-between border-t border-border bg-card px-6 py-4">
      <Button variant="ghost" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
      <Button onClick={handleSave} disabled={canSave}>{editing ? "บันทึก" : "สร้าง"}</Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />เพิ่มผู้ใช้งาน</Button>
      </div>

      <div className="rounded-2xl border bg-card shadow-sm md:overflow-clip">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="sticky top-0 z-10 bg-card border-b border-border shadow-[0_1px_3px_rgba(0,0,0,0.08)] [&>th]:h-8 [&>th]:py-0 [&>th]:text-xs [&>th]:text-muted-foreground">
              <TableHead className="px-2">ชื่อ</TableHead>
              <TableHead className="w-56 px-2">อีเมล</TableHead>
              <TableHead className="w-28 px-2">บทบาท</TableHead>
              <TableHead className="w-24 px-2">สถานะ</TableHead>
              <TableHead className="w-[120px] px-2">การดำเนินการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-12">
                <div className="flex flex-col items-center gap-3 text-center">
                  <Users className="h-8 w-8 text-muted-foreground/40" />
                  <div>
                    <p className="text-sm font-medium text-foreground">ยังไม่มีผู้ใช้งาน</p>
                    <p className="text-xs text-muted-foreground mt-0.5">เพิ่มผู้ใช้งานเพื่อให้เข้าถึงระบบได้</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />เพิ่มผู้ใช้งาน</Button>
                </div>
              </TableCell></TableRow>
            ) : users.map((user) => (
              <TableRow key={user.id} className={`h-9 [&>td]:py-1 ${!user.isActive ? "opacity-50" : ""}`}>
                <TableCell className="px-2"><span className="block truncate font-medium">{user.name}</span></TableCell>
                <TableCell className="font-mono text-xs px-2"><span className="block truncate">{user.email}</span></TableCell>
                <TableCell className="px-2"><Badge variant="outline" className="px-1.5 py-0 leading-5 text-[11px]">{ROLE_LABELS[user.role] || user.role}</Badge></TableCell>
                <TableCell className="px-2">
                  {user.isActive
                    ? <span className="inline-flex items-center rounded-full border px-1.5 py-0 leading-5 text-[11px] font-medium bg-success/15 text-success-700 border-success/30">ใช้งาน</span>
                    : <span className="inline-flex items-center rounded-full border px-1.5 py-0 leading-5 text-[11px] font-medium bg-muted text-muted-foreground border-border">ปิดใช้งาน</span>}
                </TableCell>
                <TableCell className="px-2">
                  <TooltipProvider>
                    <div className="flex gap-1">
                      <Tooltip>
                        <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => openEdit(user)} aria-label="แก้ไข" />}>
                          <Pencil className="h-3.5 w-3.5" />
                        </TooltipTrigger>
                        <TooltipContent>แก้ไข</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => handleToggleActive(user)} aria-label={user.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"} />}>
                          {user.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                        </TooltipTrigger>
                        <TooltipContent>{user.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => handleDelete(user)} aria-label="ปิดใช้งาน" />}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </TooltipTrigger>
                        <TooltipContent>ปิดใช้งาน</TooltipContent>
                      </Tooltip>
                    </div>
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {isDesktop ? (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg gap-0 overflow-hidden p-0 sm:rounded-2xl" showCloseButton={false}>
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <DialogDescription className="sr-only">{subtitle}</DialogDescription>
            <div className="flex max-h-[85vh] flex-col overflow-hidden">
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

      <AlertDialog open={deactivateTarget !== null} onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ปิดใช้งานผู้ใช้</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการปิดใช้งาน &ldquo;{deactivateTarget?.name}&rdquo; ใช่หรือไม่? ผู้ใช้จะไม่สามารถเข้าสู่ระบบได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDeactivate}>ปิดใช้งาน</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
