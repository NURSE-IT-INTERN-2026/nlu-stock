"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Pencil, Search, Trash2, UserCheck, UserX, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DIALOG_SHELL_FIT,
  DIALOG_BODY,
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { getSettingsUsers, createSettingsUser, updateSettingsUser, deleteSettingsUser } from "@/lib/api";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { ROLES } from "@/lib/roles";
import { useDebounce } from "@/hooks/use-debounce";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { PAGE_SIZE } from "@/lib/pagination-constants";

interface UserRecord {
  id: string;
  email: string;
  name: string;
  /** Derived by the API, never a column. null = no env list mentions the account and it
   *  is not a นศ./บุคลากร either, so it cannot sign in until a list does. */
  role: Role | null;
  isActive: boolean;
  /** เคยทำรายการอะไรไว้บ้างหรือยัง — มีแล้วลบถาวรไม่ได้ (FK) เหลือแค่ปิดใช้งาน */
  hasHistory: boolean;
}

export function UsersTab() {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // Only the very first fetch swaps the whole tab for a skeleton. Every later one keeps the
  // table mounted — unmounting it mid-search steals focus from the box being typed into.
  const [firstLoad, setFirstLoad] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [form, setForm] = useState({ email: "", name: "" });
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);

  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // แบ่งหน้าฝั่ง server จริง ไม่ใช่ตัดจาก array ที่โหลดมา — route คุม perPage อยู่แล้ว
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSettingsUsers({ page, perPage: PAGE_SIZE.DEFAULT, role: roleFilter, q: debounced });
      setUsers(data.users as UserRecord[]);
      setTotal(data.total);
    } catch {
      toast.error("โหลดข้อมูลไม่สำเร็จ");
    }
    setLoading(false);
    setFirstLoad(false);
  }, [page, roleFilter, debounced]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // หน้าที่ค้างอยู่ไม่มีความหมายกับผลค้นหาชุดใหม่ — page 7 ของคำเก่ามักว่างเปล่า
  useEffect(() => { setPage(1); }, [debounced]);

  function openCreate() {
    setEditing(null);
    setForm({ email: "", name: "" });
    setDialogOpen(true);
  }

  function openEdit(user: UserRecord) {
    setEditing(user);
    setForm({ email: user.email, name: user.name });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      if (editing) {
        await updateSettingsUser(editing.id, { name: form.name });
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

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteSettingsUser(deleteTarget.id);
      toast.success("ลบผู้ใช้สำเร็จ");
      fetchUsers();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
    setDeleteTarget(null);
  }

  if (firstLoad) return (
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
    <div className={cn(DIALOG_BODY, "bg-secondary/40 px-6 py-6")}>
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
        <p className="text-xs text-muted-foreground">
          บทบาทกำหนดจากรายชื่ออีเมลในค่าตั้งระบบ (env) ไม่ได้แก้จากหน้านี้
        </p>
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

      {/* บทบาทมาจาก env ไม่ใช่คอลัมน์ (ยกเว้น ผู้ยืม ที่มีคอลัมน์) — route กรองให้ฝั่ง DB */}
      <Tabs value={roleFilter} onValueChange={(v) => { setRoleFilter(v as string); setPage(1); }}>
        {/* w-full + flex-1 ของ trigger: 5 ช่องแบ่งรางเท่าๆ กัน min-w-0 กันป้ายไทยดันรางล้นจอแคบ */}
        <TabsList className="w-full min-w-0">
          <TabsTrigger value="ALL" className="min-w-0">ทั้งหมด</TabsTrigger>
          {ROLES.map((r) => (
            <TabsTrigger key={r} value={r} className="min-w-0">{ROLE_LABELS[r]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* ค้นฝั่ง server: ตารางนี้โตตามจำนวน นศ. ที่เคยล็อกอิน ไม่ใช่จำนวนเจ้าหน้าที่ */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อหรืออีเมล"
          className="pl-9"
          aria-label="ค้นหาผู้ใช้งาน"
        />
      </div>

      <div className="rounded-2xl border bg-card shadow-sm md:overflow-clip">
        <Table grid zebra className="table-fixed">
          <TableHeader sticky>
            <TableRow>
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
                    <p className="text-sm font-medium text-foreground">
                      {debounced || roleFilter !== "ALL" ? "ไม่พบผู้ใช้งานตามที่ค้นหา" : "ยังไม่มีผู้ใช้งาน"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {debounced || roleFilter !== "ALL" ? "ลองเปลี่ยนคำค้นหรือบทบาท" : "เพิ่มผู้ใช้งานเพื่อให้เข้าถึงระบบได้"}
                    </p>
                  </div>
                  {!debounced && roleFilter === "ALL" && (
                    <Button size="sm" variant="outline" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />เพิ่มผู้ใช้งาน</Button>
                  )}
                </div>
              </TableCell></TableRow>
            ) : users.map((user) => (
              <TableRow key={user.id} className={`${!user.isActive ? "opacity-50" : ""}`}>
                <TableCell className="px-2"><span className="block truncate font-medium">{user.name}</span></TableCell>
                <TableCell className="font-mono text-xs px-2"><span className="block truncate">{user.email}</span></TableCell>
                <TableCell className="px-2">
                  {user.role
                    ? <Badge variant="outline" className="px-1.5 py-0 leading-5 text-[11px]">{ROLE_LABELS[user.role]}</Badge>
                    : <span className="text-[11px] text-muted-foreground">ไม่มีสิทธิ์</span>}
                </TableCell>
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
                      {/* ลบถาวรได้เฉพาะแถวที่ยังไม่มีประวัติ — ที่เหลือ FK กันไว้ และปุ่มปิดใช้งาน
                          ข้างซ้ายคือการแบนตัวจริงอยู่แล้ว */}
                      {!user.hasHistory && (
                        <Tooltip>
                          <TooltipTrigger render={<Button variant="ghost" size="icon" onClick={() => setDeleteTarget(user)} aria-label="ลบ" />}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </TooltipTrigger>
                          <TooltipContent>ลบถาวร</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {total > 0 && (
          <Pagination page={page} total={total} pageSize={PAGE_SIZE.DEFAULT} onChange={setPage} loading={loading} unit="คน" />
        )}
      </div>

      {isDesktop ? (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg gap-0 overflow-hidden p-0 sm:rounded-2xl" showCloseButton={false}>
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
            <AlertDialogTitle>ลบผู้ใช้ถาวร</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบ &ldquo;{deleteTarget?.name}&rdquo; ออกจากระบบถาวรใช่หรือไม่? กู้คืนไม่ได้
              — และถ้าเป็น นศ./บุคลากรของคณะ แถวจะถูกสร้างใหม่ทันทีที่เข้าสู่ระบบอีกครั้ง
              ถ้าต้องการห้ามใช้งานให้ใช้ปิดใช้งานแทน
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleConfirmDelete}>ลบถาวร</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
