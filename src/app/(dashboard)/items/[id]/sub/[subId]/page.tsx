"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, XCircle, Undo2, Package, Clock, Wrench, Info, Hash, Tag, FolderTree, Layers, MapPin, ClipboardList, QrCode, Image as ImageIcon, ShoppingCart, Flag, ArrowDownToLine, Pencil, SearchX, Trash2, RefreshCw, CalendarDays, User2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { pic } from "@/lib/image";
import QRCode from "qrcode";
import { toast } from "sonner";
import { useSession } from "@/components/layout/auth-guard";
import { usePageHeader } from "@/components/layout/page-header-context";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, locationLabel, formatSubCode, EVENT_TYPE_LABELS, labelFor, CONDITION_LABELS, MAINT_TYPE_LABELS, MAINT_RESULT_LABELS, type MaintenanceType, type MaintenanceResult } from "@/lib/constants";
import { getSubItem, getSubItems, returnItem, updateSubItem } from "@/lib/api";
import { ActionTile } from "@/components/items/action-tile";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MaintenanceFormDialog } from "@/components/items/maintenance-form-dialog";
import { ReportStatusDialog } from "@/components/items/report-status-dialog";
import { MoveLocationDialog } from "@/components/items/move-location-dialog";
import { EditItemDialog } from "@/components/shared/edit-item-dialog";
import { ItemDetailMedia } from "@/components/items/item-detail-media";

interface ParentItem {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  trackIndividually: boolean;
  imageUrl: string | null;
  maintenanceCycleMonths: number;
  lastMaintenanceDate: string | null;
  nextMaintenanceDate: string | null;
  category: { id: string; name: string; profile: { name: string } | null };
  location: { id: string; building: string; floor: string; room: string; detail: string | null } | null;
  issueUnit: { id: string; name: string };
}

interface DispenseRecord {
  id: string;
  quantity: number;
  dispensedAt: string;
  returnedAt: string | null;
  usageType: string | null;
  usageNote: string | null;
  notes: string | null;
  staff: { name: string };
}

interface StatusLog {
  id: string;
  previousStatus: string;
  newStatus: string;
  reason: string | null;
  changedAt: string;
  imageUrl: string | null;
  changer: { name: string };
}

interface MaintenanceRecord {
  id: string;
  type: string;
  result: string;
  performedAt: string;
  issue: string | null;
  description: string | null;
  cost: number | null;
  performer: { name: string };
  attachmentUrls: string[];
}

interface SubItemData {
  id: string;
  subCode: string;
  name: string | null;
  status: string;
  condition: string | null;
  serialNumber: string | null;
  notes: string | null;
  imageUrl: string | null;
  images: string[];
  createdAt: string;
  updatedAt: string;
  item: ParentItem;
  dispenseRecords: DispenseRecord[];
  statusLogs: StatusLog[];
  maintenanceRecords: MaintenanceRecord[];
}

const STATUS_DOT: Record<string, string> = { AVAILABLE: "bg-success", ON_LOAN: "bg-blue-500", DAMAGED: "bg-destructive", UNDER_REPAIR: "bg-warning", LOST: "bg-destructive", DISPOSED: "bg-muted-foreground", PENDING_MAINTENANCE: "bg-warning" };

// Status → icon + tone for the hero status card
const STATUS_META: Record<string, { icon: typeof CheckCircle2; tone: "success" | "primary" | "warning" | "destructive" }> = {
  AVAILABLE: { icon: CheckCircle2, tone: "success" },
  ON_LOAN: { icon: Undo2, tone: "primary" },
  IN_USE: { icon: ShoppingCart, tone: "primary" },
  PENDING_MAINTENANCE: { icon: Wrench, tone: "warning" },
  UNDER_REPAIR: { icon: Wrench, tone: "warning" },
  DAMAGED: { icon: ShieldAlert, tone: "warning" },
  LOST: { icon: XCircle, tone: "destructive" },
  DISPOSED: { icon: XCircle, tone: "destructive" },
};
const TONE_CLASS: Record<string, string> = {
  success: "text-success-700 bg-success/10 border-success/20",
  primary: "text-primary bg-primary/10 border-primary/20",
  warning: "text-warning-700 bg-warning/10 border-warning/20",
  destructive: "text-destructive bg-destructive/10 border-destructive/20",
};
const TONE_BAR: Record<string, string> = {
  success: "bg-success", primary: "bg-primary", warning: "bg-warning", destructive: "bg-destructive",
};

// ── History (sub-item timeline: dispense + status + maintenance) ──
type HistType = "DISPENSE" | "STATUS_CHANGE" | "MAINTENANCE";
const HIST_ICONS: Record<HistType, typeof Package> = {
  DISPENSE: ShoppingCart, STATUS_CHANGE: RefreshCw, MAINTENANCE: Wrench,
};
const HIST_BADGE: Record<HistType, string> = {
  DISPENSE: "bg-primary/10 text-primary border-primary/20",
  STATUS_CHANGE: "bg-warning/10 text-warning-700 border-warning/20",
  MAINTENANCE: "bg-primary/5 text-primary border-primary/15",
};
const HIST_CHIPS: { value: HistType | ""; label: string }[] = [
  { value: "", label: "ทั้งหมด" },
  { value: "DISPENSE", label: "เบิก" },
  { value: "STATUS_CHANGE", label: "เปลี่ยนสถานะ" },
  { value: "MAINTENANCE", label: "บำรุงรักษา" },
];

// Next-maintenance-date → tone (overdue / soon / ok)
function maintTone(nextDate: string | null): { tone: "success" | "warning" | "destructive" | "primary" } {
  if (!nextDate) return { tone: "primary" };
  const diff = (new Date(nextDate).getTime() - Date.now()) / 86_400_000;
  if (diff < 0) return { tone: "destructive" };
  if (diff <= 30) return { tone: "warning" };
  return { tone: "success" };
}

type TabKey = "overview" | "media" | "subcodes" | "history" | "maintenance";

export default function SubItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useSession();
  const itemId = params.id as string;
  const subId = params.subId as string;

  const [sub, setSub] = useState<SubItemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [returning, setReturning] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");
  const [histFilter, setHistFilter] = useState<HistType | "">("");
  const [maintOpen, setMaintOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<"DAMAGED" | "LOST" | "DISPOSED" | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [siblings, setSiblings] = useState<{ id: string; subCode: string; status: string }[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const canAct = user?.role === "ADMIN" || user?.role === "STAFF";

  const fetchSub = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSubItem(itemId, subId);
      setSub(data as SubItemData);
    } catch {}
    setLoading(false);
  }, [itemId, subId]);

  useEffect(() => { fetchSub(); }, [fetchSub]);

  const { setDetail } = usePageHeader();
  useEffect(() => {
    setDetail(sub ? formatSubCode(sub.item.code, sub.subCode) : null);
    return () => setDetail(null);
  }, [sub, setDetail]);

  useEffect(() => {
    if (sub) QRCode.toDataURL(formatSubCode(sub.item.code, sub.subCode), { width: 128, margin: 1 }).then(setQrDataUrl).catch(() => {});
  }, [sub]);

  // Sibling copies of the same parent item — for the "รหัสย่อย" tab.
  useEffect(() => {
    if (sub) {
      getSubItems(sub.item.id)
        .then((d) => setSiblings((d as { id: string; subCode: string; status: string }[]).map((s) => ({ id: s.id, subCode: s.subCode, status: s.status }))))
        .catch(() => {});
    }
  }, [sub?.item.id]);

  const activeDispense = useMemo(
    () => sub?.dispenseRecords.find((d) => d.returnedAt === null) ?? null,
    [sub],
  );

  const historyEvents = useMemo<{ id: string; type: HistType; date: string; description: string; user: string }[]>(() => {
    if (!sub) return [];
    const dispense = sub.dispenseRecords.map((d) => ({
      id: d.id, type: "DISPENSE" as const, date: d.dispensedAt,
      description: `เบิกออก${d.returnedAt ? " · คืนแล้ว" : ""}${d.usageNote ? ` · ${d.usageNote}` : ""}`,
      user: d.staff.name,
    }));
    const status = sub.statusLogs.map((l) => ({
      id: l.id, type: "STATUS_CHANGE" as const, date: l.changedAt,
      description: `${STATUS_LABELS[l.previousStatus] ?? l.previousStatus} → ${STATUS_LABELS[l.newStatus] ?? l.newStatus}${l.reason ? ` · ${l.reason}` : ""}`,
      user: l.changer.name,
    }));
    const maint = sub.maintenanceRecords.map((r) => ({
      id: r.id, type: "MAINTENANCE" as const, date: r.performedAt,
      description: `${labelFor(MAINT_TYPE_LABELS, r.type as MaintenanceType)} · ${labelFor(MAINT_RESULT_LABELS, r.result as MaintenanceResult)}${r.issue ? ` · ${r.issue}` : ""}`,
      user: r.performer.name,
    }));
    return [...dispense, ...status, ...maint]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sub]);

  const filteredEvents = useMemo(
    () => (histFilter ? historyEvents.filter((e) => e.type === histFilter) : historyEvents),
    [historyEvents, histFilter],
  );

  const tabs: { key: TabKey; label: string; icon: typeof Info }[] = useMemo(() => [
    { key: "overview", label: "ข้อมูลทั่วไป", icon: Info },
    ...(!!(sub?.imageUrl || (sub?.images?.length ?? 0) > 0) || !!canAct ? [{ key: "media" as const, label: "รูปภาพ", icon: ImageIcon }] : []),
    ...(siblings.length > 1 ? [{ key: "subcodes" as const, label: `รหัสย่อย (${siblings.length})`, icon: Hash }] : []),
    { key: "history", label: "ประวัติ", icon: Clock },
    { key: "maintenance", label: `การซ่อมบำรุง${sub?.maintenanceRecords.length ? ` (${sub.maintenanceRecords.length})` : ""}`, icon: Wrench },
  ], [sub?.imageUrl, sub?.images?.length, sub?.maintenanceRecords.length, siblings.length, canAct]);

  const onReturn = async () => {
    if (!sub) return;
    setReturning(true);
    try {
      await returnItem(sub.item.id, { subItemId: sub.id });
      toast.success("คืนพัสดุย่อยแล้ว");
      await fetchSub();
    } catch {
      toast.error("คืนไม่สำเร็จ");
    } finally {
      setReturning(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 animate-in fade-in duration-300">
        <div className="grid place-items-center size-16 rounded-2xl bg-muted text-muted-foreground">
          <XCircle className="size-8" />
        </div>
        <p className="text-muted-foreground font-medium">ไม่พบพัสดุย่อย</p>
        <Button variant="outline" onClick={() => router.push("/items")}>
          <ArrowLeft className="h-4 w-4 mr-1" />กลับสู่รายการพัสดุ
        </Button>
      </div>
    );
  }

  const fullCode = formatSubCode(sub.item.code, sub.subCode);
  const cover = sub.imageUrl ?? sub.images?.[0] ?? sub.item.imageUrl ?? null;
  const fmtDate = (s: string) => new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  const fmtDay = (s: string) => new Date(s).toLocaleDateString("th-TH");

  const detailRows: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; mono?: boolean }[] = [
    { icon: Hash, label: "รหัส", value: fullCode, mono: true },
    { icon: Tag, label: "ชื่อ", value: sub.name ?? sub.item.name },
    { icon: FolderTree, label: "ประเภท", value: sub.item.category.profile?.name ?? sub.item.category.name },
    { icon: Layers, label: "หมวดหมู่", value: sub.item.category.name },
    { icon: Hash, label: "สถานะ", value: STATUS_LABELS[sub.status] ?? sub.status.replace(/_/g, " ") },
    ...(sub.condition ? [{ icon: ClipboardList, label: "สภาพ", value: CONDITION_LABELS[sub.condition] ?? sub.condition }] : []),
    ...(sub.serialNumber ? [{ icon: Hash, label: "หมายเลขซีเรียล", value: sub.serialNumber, mono: true }] : []),
    { icon: Layers, label: "หน่วยเบิก", value: sub.item.issueUnit.name },
    { icon: MapPin, label: "ที่ตั้ง", value: sub.item.location ? locationLabel(sub.item.location) : "-" },
    { icon: Clock, label: "วันที่สร้าง", value: fmtDay(sub.createdAt) },
  ];

  const qrBlock = (
    <div className="border-t border-border p-4 sm:p-5 grid grid-cols-[auto_1fr] gap-4 sm:gap-5 items-center bg-muted/20">
      <div className="size-20 sm:size-24 shrink-0 rounded-xl border border-border bg-card p-2 grid place-items-center">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt={`QR for ${fullCode}`} className="size-full rounded-md" />
        ) : (
          <QrCode className="size-12 text-foreground animate-pulse" />
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">QR code</div>
        <div className="text-sm text-muted-foreground mt-1 truncate">สแกนเพื่อค้นหาพัสดุย่อย</div>
        <div className="font-mono text-sm font-semibold mt-0.5 truncate">{fullCode}</div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="max-w-6xl">
        {/* ── Hero card: Cover + Title + Status + Tabs ── */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="grid gap-5 sm:gap-6 lg:gap-8 p-4 sm:p-6 grid-cols-1 md:grid-cols-[auto_1fr] xl:grid-cols-[auto_1fr_auto]">
            {/* Cover */}
            <div className="relative w-full md:w-48 lg:w-56 aspect-square rounded-xl overflow-hidden ring-1 ring-border bg-muted shadow-sm">
              <img src={cover ?? pic(fullCode, 640, 480)} alt={sub.name ?? fullCode} className="size-full object-cover" />
              <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wider font-semibold bg-background/90 px-2 py-0.5 rounded-full backdrop-blur-sm">Cover</span>
            </div>

            {/* Title block */}
            <div className="flex flex-col justify-between min-w-0 py-1">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs mb-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
                    {sub.item.category.profile?.name ?? sub.item.category.name}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono text-muted-foreground">{fullCode}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("size-1.5 rounded-full", STATUS_DOT[sub.status] || "bg-muted-foreground")} />
                    <span className="text-muted-foreground">{STATUS_LABELS[sub.status] ?? sub.status.replace(/_/g, " ")}</span>
                  </span>
                </div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold leading-none tracking-tight text-balance break-words">
                  {sub.name ?? sub.item.name}
                </h1>
                {sub.item.nameEn && <p className="text-muted-foreground mt-2 text-sm italic">{sub.item.nameEn}</p>}
                {sub.notes && <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{sub.notes}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-4">
                {sub.condition && (
                  <span className="text-xs px-2.5 py-1 rounded-md bg-muted border border-border text-muted-foreground">
                    สภาพ <span className="text-foreground font-medium">{CONDITION_LABELS[sub.condition] ?? sub.condition}</span>
                  </span>
                )}
                {sub.serialNumber && (
                  <span className="text-xs px-2.5 py-1 rounded-md bg-muted border border-border text-muted-foreground font-mono">
                    S/N <span className="text-foreground font-medium">{sub.serialNumber}</span>
                  </span>
                )}
                <span className="text-xs px-2.5 py-1 rounded-md bg-muted border border-border text-muted-foreground">
                  หน่วย <span className="text-foreground font-medium">{sub.item.issueUnit.name}</span>
                </span>
                <span className="text-xs px-2.5 py-1 rounded-md bg-muted border border-border text-muted-foreground">
                  {sub.item.location ? locationLabel(sub.item.location) : "ไม่ระบุที่ตั้ง"}
                </span>
              </div>
            </div>

            {/* Status summary */}
            <StatusSummary
              status={sub.status}
              activeLoan={activeDispense}
              canAct={canAct}
              onReturn={onReturn}
              returning={returning}
            />
          </div>

          {/* ── Tabs ── */}
          <div className="border-t border-border px-2 sm:px-6 flex items-center gap-1 bg-muted/30 overflow-x-auto">
            {tabs.map((t) => (
              <TabBtn key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} icon={t.icon}>
                {t.label}
              </TabBtn>
            ))}
          </div>
        </section>

        {/* ── Tab content ── */}
        <div className="mt-5 space-y-6 animate-in fade-in duration-200" key={tab}>
          {tab === "overview" && (
            <div className="space-y-5">
              <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-5 items-start">
                {/* ── Details ── */}
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <SectionHeader eyebrow="ข้อมูลพัสดุย่อย" title="รายละเอียด" />
                  <div className="divide-y divide-border">
                    {detailRows.map((d, i) => {
                      const Icon = d.icon;
                      return (
                        <div
                          key={i}
                          className={cn(
                            "grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5",
                            i % 2 === 1 && "bg-muted/30",
                          )}
                        >
                          <span className="size-8 shrink-0 rounded-lg bg-primary/5 border border-primary/10 grid place-items-center text-primary">
                            <Icon className="size-4" />
                          </span>
                          <span className="text-sm text-muted-foreground min-w-0 truncate">{d.label}</span>
                          <span className={cn("text-sm text-foreground font-medium text-right min-w-0 truncate", d.mono && "font-mono")}>
                            {d.value}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Manage (staff) or QR (viewer) ── */}
                {canAct ? (
                  <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    <SectionHeader eyebrow="การจัดการ" title="จัดการสต็อก" />
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <ActionTile icon={ShoppingCart} label="เพิ่มเข้าตะกร้า" tone="primary" onClick={() => router.push(`/dispense?item=${sub.item.id}`)} />
                      <ActionTile icon={ArrowDownToLine} label="รับเข้า" tone="default" onClick={() => router.push(`/receive?item=${sub.item.id}`)} />
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<ActionTile icon={Package} label="ปรับสต็อก" tone="default" />} />
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => setStatusAction("LOST")}>
                            <SearchX className="size-4" />สูญหาย
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setStatusAction("DISPOSED")}>
                            <Trash2 className="size-4" />ตัดจำหน่าย
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <ActionTile icon={Flag} label="แจ้งชำรุด" tone="destructive" onClick={() => setStatusAction("DAMAGED")} />
                      <ActionTile icon={MapPin} label="ย้ายที่ตั้ง" tone="default" onClick={() => setMoveOpen(true)} />
                      <ActionTile icon={Pencil} label="แก้ไขข้อมูล" tone="default" onClick={() => setEditOpen(true)} />
                    </div>
                    {qrBlock}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    <SectionHeader title="QR code" />
                    {qrBlock}
                  </div>
                )}
              </section>

            </div>
          )}

          {tab === "media" && (
            <ItemDetailMedia
              item={{ id: sub.id, imageUrl: sub.imageUrl, images: sub.images }}
              canAct={!!canAct}
              onRefresh={fetchSub}
              onSave={(id, data) => updateSubItem(id, data)}
            />
          )}

          {tab === "subcodes" && (
            <section className="rounded-2xl border border-border bg-card overflow-hidden">
              <SectionHeader
                eyebrow="พัสดุหลัก"
                title={`รหัสย่อย (${siblings.length})`}
                right={
                  <Button size="sm" variant="outline" onClick={() => router.push(`/items/${sub.item.code}`)}>
                    <Package className="h-3.5 w-3.5 mr-1" />พัสดุหลัก
                  </Button>
                }
              />
              <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {siblings.map((s) => {
                  const isCurrent = s.id === sub.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => router.push(`/items/${sub.item.code}/sub/${s.subCode}`)}
                      className={cn(
                        "flex flex-col items-start rounded-lg border p-2.5 text-left transition-colors",
                        isCurrent ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <span className="font-mono text-sm">{formatSubCode(sub.item.code, s.subCode)}</span>
                      <span className="text-[11px] text-muted-foreground mt-0.5">{STATUS_LABELS[s.status] ?? s.status.replace(/_/g, " ")}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {tab === "history" && (
            <section className="rounded-2xl border border-border bg-card overflow-hidden">
              <SectionHeader eyebrow="กิจกรรม" title="ประวัติ" />

              {/* ── Quick filter chips ── */}
              <div className="px-4 sm:px-5 pt-4 flex items-center gap-2 overflow-x-auto">
                <span className="text-sm text-muted-foreground shrink-0">Type:</span>
                {HIST_CHIPS.map((chip) => {
                  const active = histFilter === chip.value;
                  return (
                    <button
                      key={chip.value}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition-colors",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 text-muted-foreground border-border hover:text-foreground hover:bg-muted",
                      )}
                      onClick={() => setHistFilter(chip.value)}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              {/* ── Timeline ── */}
              {filteredEvents.length === 0 ? (
                <p className="text-center py-10 text-sm text-muted-foreground">ไม่มีรายการในหมวดนี้</p>
              ) : (
                <ol className="p-4 sm:p-5 space-y-3">
                  {filteredEvents.map((e) => {
                    const Icon = HIST_ICONS[e.type] || Package;
                    return (
                      <li
                        key={`${e.type}-${e.id}`}
                        className="grid grid-cols-[auto_1fr] gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-border bg-muted/20"
                      >
                        <div className="size-10 shrink-0 rounded-lg bg-primary/5 border border-primary/10 grid place-items-center text-primary">
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase border",
                              HIST_BADGE[e.type],
                            )}>
                              {labelFor(EVENT_TYPE_LABELS, e.type)}
                            </span>
                            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                              <CalendarDays className="size-3" />
                              {fmtDate(e.date)}
                            </span>
                          </div>
                          <p className="text-sm font-medium">{e.description}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                            <User2 className="size-3" /> by {e.user}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          )}

          {tab === "maintenance" && (
            <section className="rounded-2xl border border-border bg-card overflow-hidden">
              <SectionHeader
                eyebrow="ซ่อมบำรุง"
                title="แผน & ประวัติซ่อมบำรุง"
                right={canAct ? (
                  <Button size="sm" onClick={() => setMaintOpen(true)}>
                    <Wrench className="h-3.5 w-3.5 mr-1" />บันทึกการซ่อม
                  </Button>
                ) : undefined}
              />

              {/* ── Stat cards ── */}
              <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 border-b border-border">
                <StatCard label="รอบถัดไป" value={sub.item.nextMaintenanceDate ? fmtDay(sub.item.nextMaintenanceDate) : "—"} icon={CalendarDays} tone={maintTone(sub.item.nextMaintenanceDate).tone} />
                <StatCard label="จำนวนการซ่อมบำรุง" value={`${sub.maintenanceRecords.length} ครั้ง`} icon={Wrench} />
                <StatCard label="สถานะปัจจุบัน" value={STATUS_LABELS[sub.status] ?? sub.status.replace(/_/g, " ")} icon={ShieldAlert} tone={STATUS_META[sub.status]?.tone ?? "primary"} />
              </div>

              {/* ── Maintenance schedule info ── */}
              <div className="p-4 sm:p-5 border-b border-border">
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">ข้อมูลการบำรุงรักษา</div>
                <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs">รอบบำรุงรักษา</dt>
                    <dd className="font-medium mt-0.5">{sub.item.maintenanceCycleMonths ? `${sub.item.maintenanceCycleMonths} เดือน` : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">บำรุงล่าสุด</dt>
                    <dd className="font-medium mt-0.5">
                      {sub.item.lastMaintenanceDate
                        ? fmtDay(sub.item.lastMaintenanceDate)
                        : sub.maintenanceRecords[0] ? fmtDay(sub.maintenanceRecords[0].performedAt) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">รอบถัดไป</dt>
                    <dd className="font-medium mt-0.5">{sub.item.nextMaintenanceDate ? fmtDay(sub.item.nextMaintenanceDate) : "—"}</dd>
                  </div>
                </dl>
              </div>

              {/* ── Maintenance history ── */}
              <div className="p-4 sm:p-5">
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">ประวัติการซ่อมบำรุง</div>
                {sub.maintenanceRecords.length === 0 ? (
                  <p className="text-center py-8 text-sm text-muted-foreground">ยังไม่มีประวัติการซ่อมบำรุง</p>
                ) : (
                  <ul className="space-y-3">
                    {sub.maintenanceRecords.map((rec) => (
                      <li key={rec.id} className="grid grid-cols-[auto_1fr] gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-border bg-muted/20">
                        <div className="size-10 shrink-0 rounded-lg bg-primary/5 border border-primary/10 grid place-items-center text-primary">
                          <Wrench className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                              <CalendarDays className="size-3" />{fmtDay(rec.performedAt)}
                            </span>
                            <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full border bg-muted text-foreground border-border">
                              {labelFor(MAINT_TYPE_LABELS, rec.type as MaintenanceType)}
                            </span>
                            <span className={cn(
                              "text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full border",
                              rec.result === "AVAILABLE" ? "bg-success/10 text-success-700 border-success/20" : "bg-primary/10 text-primary border-primary/20",
                            )}>
                              {labelFor(MAINT_RESULT_LABELS, rec.result as MaintenanceResult)}
                            </span>
                          </div>
                          {rec.issue && <div className="text-sm font-medium mt-1">{rec.issue}</div>}
                          {rec.description && <div className="text-sm text-muted-foreground mt-0.5">{rec.description}</div>}
                          <div className="text-xs text-muted-foreground mt-0.5">
                            โดย {rec.performer.name}{rec.cost != null ? ` · ฿${rec.cost.toLocaleString()}` : ""}
                          </div>
                          {rec.attachmentUrls.length > 0 && (
                            <div className="flex gap-2 mt-1.5">
                              {rec.attachmentUrls.map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                                  {url.endsWith(".pdf") ? `PDF ${i + 1}` : `รูป ${i + 1}`}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      <MaintenanceFormDialog
        open={maintOpen}
        onOpenChange={setMaintOpen}
        itemId={sub.item.id}
        itemLabel={sub.item.name}
        subItemId={sub.id}
        subItemLabel={fullCode}
        onSuccess={fetchSub}
      />

      <ReportStatusDialog
        open={statusAction !== null}
        onOpenChange={(o) => { if (!o) setStatusAction(null); }}
        itemId={sub.item.id}
        itemCode={sub.item.code}
        status={statusAction ?? "DAMAGED"}
        trackIndividually
        subItems={[{ id: sub.id, subCode: sub.subCode, status: sub.status }]}
        onSuccess={fetchSub}
      />

      <MoveLocationDialog
        key={moveOpen ? "open" : "closed"}
        open={moveOpen}
        onOpenChange={setMoveOpen}
        items={[{ id: sub.item.id, code: sub.item.code, name: sub.item.name }]}
        currentLocationId={sub.item.location?.id ?? null}
        onSuccess={fetchSub}
      />

      <EditItemDialog
        open={editOpen}
        itemId={sub.item.id}
        onOpenChange={setEditOpen}
        onSaved={fetchSub}
      />
    </div>
  );
}

function TabBtn({
  active, onClick, icon: Icon, children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-2 px-3 sm:px-4 py-3.5 text-sm transition-colors whitespace-nowrap",
        active ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {children}
      {active && (
        <motion.span
          layoutId="sub-item-detail-tab"
          transition={{ type: "spring", stiffness: 450, damping: 35 }}
          className="absolute inset-x-3 -bottom-px h-0.5 bg-primary rounded-full"
        />
      )}
    </button>
  );
}

// ── Status summary (right slot of hero — sub-item has no qty, status is the signal) ──
function StatusSummary({ status, activeLoan, canAct, onReturn, returning }: {
  status: string;
  activeLoan: DispenseRecord | null;
  canAct: boolean;
  onReturn: () => void;
  returning: boolean;
}) {
  const meta = STATUS_META[status] ?? { icon: Info, tone: "primary" as const };
  const tone = meta.tone;
  const Icon = meta.icon;
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, " ");
  const isOnLoan = status === "ON_LOAN" && activeLoan;

  return (
    <div className="w-full xl:w-72 rounded-xl bg-gradient-to-br from-muted/50 to-card border border-border p-5 md:col-span-2 xl:col-span-1">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">สถานะปัจจุบัน</div>
      <div className="mt-3 flex items-center gap-3">
        <span className={cn("size-12 grid place-items-center rounded-xl border", TONE_CLASS[tone])}>
          <Icon className="size-6" />
        </span>
        <span className="text-3xl font-semibold leading-none">{label}</span>
      </div>

      {/* status bar — mirrors the parent's usage bar */}
      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">สัดส่วนการใช้งาน</span>
        <span className="text-muted-foreground">
          {isOnLoan ? "กำลังยืมอยู่" : status === "AVAILABLE" ? "พร้อมใช้งาน 100%" : label}
        </span>
      </div>
      <div className="mt-2 flex h-2.5 rounded-full overflow-hidden bg-muted">
        <div className={cn("h-full", TONE_BAR[tone])} style={{ width: "100%" }} />
      </div>

      {isOnLoan && (
        <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="text-xs text-muted-foreground">ผู้ยืม</div>
          <div className="font-medium text-primary mt-0.5">→ {activeLoan.staff.name}</div>
          {canAct && (
            <Button size="sm" variant="outline" className="mt-2 w-full" onClick={onReturn} disabled={returning}>
              <Undo2 className="h-3.5 w-3.5 mr-1" />คืนพัสดุ
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="px-4 sm:px-5 py-4 border-b border-border grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{eyebrow}</div>}
        <h2 className="text-lg font-semibold leading-tight mt-0.5 truncate">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone = "primary" }: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "primary" | "success" | "warning" | "destructive";
}) {
  const toneClass = {
    primary: "bg-primary/5 text-primary border-primary/10",
    success: "bg-success/10 text-success-700 border-success/20",
    warning: "bg-warning/10 text-warning-700 border-warning/20",
    destructive: "bg-destructive/10 text-destructive border-destructive/20",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 grid grid-cols-[auto_1fr] items-center gap-3">
      <div className={cn("size-10 shrink-0 rounded-lg grid place-items-center border", toneClass)}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold leading-tight truncate">{value}</div>
      </div>
    </div>
  );
}
