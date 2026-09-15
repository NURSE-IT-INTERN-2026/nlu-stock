"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { getSettingsUsers, createSettingsUser, updateSettingsUser, deleteSettingsUser, lookupSettingsUser } from "@/lib/api";
import { GRANTABLE_ROLES } from "@/lib/validators/user";
import { ROLE_LABELS, ROLE_BADGE, labelFor, type Role } from "@/lib/constants";
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
import { EmptyState } from "@/components/shared/empty-state";

type GrantableRole = (typeof GRANTABLE_ROLES)[number];
type Preview = Awaited<ReturnType<typeof lookupSettingsUser>>;

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
  const [form, setForm] = useState<{ email: string; name: string; role: GrantableRole }>({
    email: "", name: "", role: "ADMIN",
  });
  // เพิ่มผู้ใช้ = 2 จังหวะ: กรอกอีเมล+บทบาท แล้วดูสรุปก่อนยืนยัน (แก้ไขไม่ต้อง มีข้อมูลอยู่แล้ว)
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);
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
  //
  // คำค้นเปลี่ยนเร็วกว่าคำตอบกลับมา: พิมพ์ต่ออีกตัวระหว่างที่รอบก่อนยังค้างอยู่ แล้วรอบเก่ากลับ
  // ทีหลัง ตารางจะโชว์ผลของคำที่ผู้ใช้ลบทิ้งไปแล้ว. นับรอบไว้ แล้วทิ้งคำตอบที่ไม่ใช่รอบล่าสุด
  const reqId = useRef(0);
  const fetchUsers = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const data = await getSettingsUsers({ page, perPage: PAGE_SIZE.DEFAULT, role: roleFilter, q: debounced });
      if (id !== reqId.current) return;
      setUsers(data.users as UserRecord[]);
      setTotal(data.total);
    } catch {
      if (id !== reqId.current) return;
      toast.error("โหลดข้อมูลไม่สำเร็จ");
    }
    setLoading(false);
    setFirstLoad(false);
  }, [page, roleFilter, debounced]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function openCreate() {
    setEditing(null);
    setForm({ email: "", name: "", role: "ADMIN" });
    setStep("form");
    setPreview(null);
    setDialogOpen(true);
  }

  function openEdit(user: UserRecord) {
    setEditing(user);
    setForm({ email: user.email, name: user.name, role: "ADMIN" });
    setStep("form");
    setDialogOpen(true);
  }

  /** ถามระบบว่ารู้จักอีเมลนี้ว่าอะไรบ้าง แล้วค่อยให้ยืนยัน — ไม่มีใครควรกดเพิ่มโดยไม่เห็นว่า
   *  กำลังเพิ่มใครและเปลี่ยนบทบาทจากอะไรเป็นอะไร */
  async function handleNext() {
    setChecking(true);
    try {
      setPreview(await lookupSettingsUser(form.email));
      setStep("confirm");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ตรวจสอบอีเมลไม่สำเร็จ");
    }
    setChecking(false);
  }

  async function handleSave() {
    try {
      if (editing) {
        await updateSettingsUser(editing.id, { name: form.name });
        toast.success("อัปเดตผู้ใช้สำเร็จ");
      } else {
        await createSettingsUser({ email: form.email, role: form.role });
        toast.success(preview?.known ? "ให้บทบาทสำเร็จ" : "เพิ่มผู้ใช้งานสำเร็จ");
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

  // โครงเดียวกับการ์ดจริง (แถบเครื่องมือ + ตาราง) ไม่งั้นตอนโหลดเสร็จหน้าจะกระโดด
  if (firstLoad) return (
    <div className="rounded-2xl border bg-card md:overflow-clip">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4">
        <Skeleton className="h-9 w-full rounded-lg" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 flex-1 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>
    </div>
  );

  // ── Modal shell elements (shared by Dialog + Sheet) ──────────
  const confirming = !editing && step === "confirm";
  const title = editing ? "แก้ไขผู้ใช้งาน" : confirming ? "ยืนยันการเพิ่มผู้ใช้งาน" : "เพิ่มผู้ใช้งาน";
  const subtitle = editing
    ? "แก้ไขข้อมูลผู้ใช้งาน"
    : confirming
      ? "ตรวจข้อมูลก่อนยืนยัน"
      : "กรอกอีเมลและบทบาทที่จะให้";

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

  const summaryRow = (label: string, value: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );

  const modalBody = (
    <div className={cn(DIALOG_BODY, "bg-secondary/40 px-6 py-6")}>
      {editing ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-email">อีเมล</Label>
            <Input id="user-email" value={form.email} disabled type="email" className="bg-card" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-name">ชื่อ-นามสกุล</Label>
            <Input id="user-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-card" />
          </div>
        </div>
      ) : confirming ? (
        <div className="space-y-4">
          <div className="divide-y divide-border rounded-xl border border-border bg-card px-4 py-1">
            {summaryRow(
              "ชื่อ",
              preview?.name ?? (
                <span className="font-normal text-muted-foreground">
                  — ชื่อจริงจะมาเองตอนเข้าสู่ระบบครั้งแรก
                </span>
              ),
            )}
            {summaryRow("อีเมล", <span className="font-mono text-xs break-all">{preview?.email ?? form.email}</span>)}
            {summaryRow(
              "บทบาท",
              preview?.currentRole && preview.currentRole !== form.role ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-muted-foreground line-through">{labelFor(ROLE_LABELS, preview.currentRole as Role)}</span>
                  <span aria-hidden>→</span>
                  <span>{ROLE_LABELS[form.role]}</span>
                </span>
              ) : (
                ROLE_LABELS[form.role]
              ),
            )}
          </div>
          {preview && !preview.isActive && (
            <p className="text-xs text-warning-700 dark:text-warning-200">
              บัญชีนี้ปิดใช้งานอยู่ — ยืนยันแล้วจะเปิดกลับ
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-email">อีเมล</Label>
            <Input
              id="user-email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              type="email"
              placeholder="somchai.s@cmu.ac.th"
              className="bg-card"
            />
          </div>
          <div className="space-y-2">
            <Label>บทบาท</Label>
            {/* สองตัวเลือก ใช้ปุ่มไปเลย — dropdown สำหรับ 2 ค่าคือการซ่อนของที่แสดงหมดได้ */}
            <div className="grid grid-cols-2 gap-2">
              {GRANTABLE_ROLES.map((r) => (
                <Button
                  key={r}
                  type="button"
                  variant={form.role === r ? "default" : "outline"}
                  className={form.role === r ? "" : "bg-card"}
                  aria-pressed={form.role === r}
                  onClick={() => setForm({ ...form, role: r })}
                >
                  {ROLE_LABELS[r]}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const modalFooter = (
    <div className="flex items-center justify-between border-t border-border bg-card px-6 py-4">
      {confirming ? (
        <>
          <Button variant="ghost" onClick={() => setStep("form")}>ย้อนกลับ</Button>
          <Button onClick={handleSave}>{preview?.known ? "ยืนยันให้บทบาท" : "ยืนยันเพิ่มผู้ใช้งาน"}</Button>
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
          {editing ? (
            <Button onClick={handleSave} disabled={!form.name.trim()}>บันทึก</Button>
          ) : (
            <Button onClick={handleNext} disabled={!form.email.trim() || checking}>
              {checking ? "กำลังตรวจสอบ…" : "ถัดไป"}
            </Button>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
    {/* ตัวกรอง ช่องค้น ปุ่มเพิ่ม และตาราง เป็นเครื่องมือของตารางเดียวกัน — อยู่ในการ์ดใบเดียว
        ไม่ใช่ลอยอยู่บน page wash คนละชั้นกัน */}
    <div className="rounded-2xl border bg-card shadow-sm md:overflow-clip">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4">
        {/* บทบาทมาจาก env ไม่ใช่คอลัมน์ (ยกเว้น ผู้ยืม ที่มีคอลัมน์) — route กรองให้ฝั่ง DB */}
        <Tabs value={roleFilter} onValueChange={(v) => { setRoleFilter(v as string); setPage(1); }}>
          {/* shrink-0 คู่กับ flex-1 ของ base: จอกว้างแบ่งราง 5 ช่องเท่าๆ กัน จอแคบดันรางให้เลื่อน
              แทนที่จะบีบจนป้ายขาด — "ผู้ดูแลระบบ" ไม่พอในช่อง 61px ตั้งแต่ยังมีแค่ 4 ช่อง */}
          <TabsList className="w-full min-w-0 overflow-x-auto">
            <TabsTrigger value="ALL" className="shrink-0 px-3">ทั้งหมด</TabsTrigger>
            {ROLES.map((r) => (
              <TabsTrigger key={r} value={r} className="shrink-0 px-3">{ROLE_LABELS[r]}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {/* ค้นฝั่ง server: ตารางนี้โตตามจำนวน นศ. ที่เคยล็อกอิน ไม่ใช่จำนวนเจ้าหน้าที่ */}
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              // รีเซ็ตหน้าตรงนี้ ไม่ใช่ใน effect ที่ฟัง debounced: effect จะยิงรอบหนึ่งด้วยเลขหน้าเก่า
              // ก่อน setPage(1) จะมีผล — สองรอบต่อการพิมพ์หนึ่งครั้ง โดยรอบแรกทิ้งเปล่า
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="ค้นหาชื่อหรืออีเมล"
              className="pl-9"
              aria-label="ค้นหาผู้ใช้งาน"
            />
          </div>
          <Button className="shrink-0" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">เพิ่มผู้ใช้งาน</span>
          </Button>
        </div>
      </div>

      <Table grid zebra className="table-fixed">
          <TableHeader sticky>
            <TableRow>
              <TableHead className="px-2">ชื่อ</TableHead>
              <TableHead className="w-56 px-2">อีเมล</TableHead>
              <TableHead className="w-28 px-2">บทบาท</TableHead>
              <TableHead className="w-[120px] px-2">การดำเนินการ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-12">
                <EmptyState
                  className="py-0"
                  title={debounced || roleFilter !== "ALL" ? "ไม่พบผู้ใช้งานตามที่ค้นหา" : "ยังไม่มีผู้ใช้งาน"}
                  description={debounced || roleFilter !== "ALL" ? "ลองเปลี่ยนคำค้นหรือบทบาท" : "เพิ่มผู้ใช้งานเพื่อให้เข้าถึงระบบได้"}
                  action={!debounced && roleFilter === "ALL" ? (
                    <Button size="sm" variant="outline" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1" />เพิ่มผู้ใช้งาน</Button>
                  ) : undefined}
                />
              </TableCell></TableRow>
            ) : users.map((user) => (
              <TableRow key={user.id} className={`${!user.isActive ? "opacity-50" : ""}`}>
                <TableCell className="px-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{user.name}</span>
                    {/* "ใช้งาน" คือสถานะของเกือบทุกแถว — ป้ายที่ติดทุกแถวไม่ได้บอกอะไร
                        และป้ายเขียวยังอ่านเป็นไฟ online/offline. เหลือไว้เฉพาะข้อยกเว้น */}
                    {!user.isActive && (
                      <span className="shrink-0 inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0 leading-5 text-[11px] font-medium text-muted-foreground">
                        ปิดใช้งาน
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs px-2"><span className="block truncate">{user.email}</span></TableCell>
                {/* null ไม่ใช่บทบาทที่ต่ำกว่าผู้ยืม — คนที่เข้าระบบได้อย่างน้อยเป็นผู้ยืมเสมอ
                    แถวนั้นคือแถวที่ล็อกอินไม่ได้แล้ว (ถูกถอดจาก env / เพิ่มมือไว้เฉยๆ) */}
                <TableCell className="px-2">
                  {user.role
                    ? <Badge variant="outline" className={cn("border-transparent px-1.5 py-0 leading-5 text-[11px]", ROLE_BADGE[user.role])}>{ROLE_LABELS[user.role]}</Badge>
                    : <span className="text-[11px] text-muted-foreground">เข้าระบบไม่ได้</span>}
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
          <SheetContent side="bottom" className="h-[90dvh] rounded-t-2xl gap-0 p-0 overflow-hidden" showCloseButton={false}>
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
    </>
  );
}
