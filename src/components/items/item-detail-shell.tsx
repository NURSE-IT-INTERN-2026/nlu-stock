"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Info, Hash, Clock, Wrench, Boxes,
  CheckCircle2, AlertTriangle, XCircle, Image as ImageIcon,
  Undo2, Package, Tag, FolderTree, Layers, MapPin, ClipboardList,
  QrCode, ShoppingCart, Flag, ArrowDownToLine, Pencil, SearchX, Trash2,
  RefreshCw, CalendarDays, User2, ShieldAlert, Home, Printer,
} from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { useSession } from "@/components/layout/auth-guard";
import { usePageHeader } from "@/components/layout/page-header-context";
import { cn } from "@/lib/utils";
import { lotDisplay } from "@/lib/lot-code";
import { QrPrintDialog, type QrPrintItem } from "@/components/shared/qr-print-dialog";
import {
  STATUS_LABELS, locationLabel, formatSubCode, EVENT_TYPE_LABELS, labelFor,
  CONDITION_LABELS, MAINT_TYPE_LABELS, MAINT_RESULT_LABELS,
  type MaintenanceType, type MaintenanceResult, type ItemStatus,
  NON_TRACKED_STOCK_LABELS, nonTrackedStockKey, type NonTrackedStockKey,
} from "@/lib/constants";
import { canTransition } from "@/lib/status-utils";
import { getItem, getSubItem, getSubItems, returnItem, updateSubItemFields } from "@/lib/api";
import { pic } from "@/lib/image";
import { ItemDetailOverview } from "@/components/items/item-detail-overview";
import { ItemDetailMedia } from "@/components/items/item-detail-media";
import { ItemDetailHistory } from "@/components/items/item-detail-history";
import { ItemDetailLostHistory } from "@/components/items/item-detail-lost-history";
import { ItemDetailMaintenance } from "@/components/items/item-detail-maintenance";
import { StockAdjustmentDialog } from "@/components/items/stock-adjustment-dialog";
import { ReportStatusDialog } from "@/components/items/report-status-dialog";
import { MaintenanceFormDialog } from "@/components/items/maintenance-form-dialog";
import { EditItemDialog } from "@/components/shared/edit-item-dialog";
import { StationInRoomDialog } from "@/components/dispense/station-in-room-dialog";
import { ActionTile } from "@/components/items/action-tile";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// ── Types ──

interface CategoryType { id: string; name: string; profile: { name: string; dispenseType: "CONSUMABLE" | "COUNT" | "ITEM"; assetTracking: boolean } | null }
interface LocationType { id: string; building: string; floor: string; room: string; detail: string | null }

interface SubItemRecord { id: string; subCode: string; name: string | null; status: ItemStatus; condition: string | null; serialNumber: string | null; notes: string | null }
interface LotType { id: string; lotNumber: string; expiryDate: string | null; receivedQty: number; remainingQty: number }

interface ItemData {
  id: string; code: string; name: string; nameEn: string | null;
  category: CategoryType; trackIndividually: boolean; status: ItemStatus;
  issueUnit: { id: string; name: string }; minThreshold: number;
  location: LocationType | null; imageUrl: string | null; description: string | null;
  images: string[]; availableQty: number; totalQty: number;
  subItems: SubItemRecord[]; lots: LotType[];
  model: string | null; purchaseDate: string | null; purchasePrice: number | null;
  vendorCompany: string | null; vendorContact: string | null; vendorPhone: string | null;
  warrantyMonths: number; maintenanceCycleMonths: number;
  lastMaintenanceDate: string | null; nextMaintenanceDate: string | null;
  countCycleMonths: number | null; lastCountDate: string | null; nextCountDate: string | null;
  storageRequirements: string | null;
  dispenseRecords: unknown[]; receiveRecords: unknown[];
  maintenanceRecords: { id: string; type: string; result: string; performedAt: string; issue: string | null; description: string | null; cost: number | null; performer: { name: string }; attachmentUrls: string[] }[];
  statusLogs: unknown[]; adjustments: unknown[];
  kitComponents: { quantity: number; name: string; componentItem: { code: string; name: string; availableQty: number } | null; unit: { name: string } }[];
}

interface ParentItem {
  id: string; code: string; name: string; nameEn: string | null; trackIndividually: boolean;
  imageUrl: string | null; maintenanceCycleMonths: number;
  lastMaintenanceDate: string | null; nextMaintenanceDate: string | null;
  category: { id: string; name: string; profile: { name: string; dispenseType: "CONSUMABLE" | "COUNT" | "ITEM"; assetTracking: boolean } | null };
  location: LocationType | null; issueUnit: { id: string; name: string };
}
interface DispenseRecord { id: string; quantity: number; dispensedAt: string; returnedAt: string | null; usageType: string | null; usageNote: string | null; notes: string | null; recipient?: string | null; loanType?: string | null; staff: { name: string } }
// Sibling row as served by GET /api/settings/items/:id/sub-items — location + the one
// open dispense record (returnedAt: null, take 1), which is what the table needs.
interface SiblingRow {
  id: string; subCode: string; status: ItemStatus;
  location: LocationType | null;
  dispenseRecords: DispenseRecord[];
}
interface StatusLog { id: string; previousStatus: ItemStatus; newStatus: ItemStatus; reason: string | null; changedAt: string; imageUrl: string | null; repairVenue: "INTERNAL" | "EXTERNAL" | null; changer: { name: string } }
interface MaintenanceRecord { id: string; type: string; result: string; performedAt: string; issue: string | null; description: string | null; cost: number | null; performer: { name: string }; attachmentUrls: string[] }
interface SubItemData {
  id: string; subCode: string; name: string | null; status: ItemStatus;
  condition: string | null; serialNumber: string | null; notes: string | null;
  imageUrl: string | null; images: string[]; createdAt: string; updatedAt: string;
  location: LocationType | null;
  // Per-copy maintenance schedule (source of truth for tracked items).
  lastMaintenanceDate: string | null; nextMaintenanceDate: string | null;
  item: ParentItem; dispenseRecords: DispenseRecord[]; statusLogs: StatusLog[]; maintenanceRecords: MaintenanceRecord[];
}

// ── Item-mode stock status meta ──
const STOCK_STATUS_ORDER = ["AVAILABLE", "ON_LOAN", "IN_USE", "PENDING_MAINTENANCE", "UNDER_REPAIR", "DAMAGED", "LOST", "DISPOSED"];
const STOCK_STATUS_META: Record<string, { label: string; bar: string; dot: string }> = {
  AVAILABLE: { label: "พร้อมใช้งาน", bar: "bg-success", dot: "bg-success" },
  ON_LOAN: { label: "ถูกยืม", bar: "bg-primary", dot: "bg-primary" },
  IN_USE: { label: "กำลังใช้งาน", bar: "bg-chart-3", dot: "bg-chart-3" },
  PENDING_MAINTENANCE: { label: "รอบำรุงรักษา", bar: "bg-warning", dot: "bg-warning" },
  UNDER_REPAIR: { label: "ส่งซ่อม", bar: "bg-warning", dot: "bg-warning" },
  DAMAGED: { label: "ชำรุด", bar: "bg-warning", dot: "bg-warning" },
  LOST: { label: "สูญหาย", bar: "bg-destructive", dot: "bg-destructive" },
  DISPOSED: { label: "ตัดจำหน่าย", bar: "bg-destructive", dot: "bg-destructive" },
};

// ── Piece-mode status meta ──
const STATUS_META: Record<string, { icon: typeof CheckCircle2; tone: Tone }> = {
  AVAILABLE: { icon: CheckCircle2, tone: "success" },
  ON_LOAN: { icon: Undo2, tone: "primary" },
  IN_USE: { icon: ShoppingCart, tone: "primary" },
  PENDING_MAINTENANCE: { icon: Wrench, tone: "warning" },
  UNDER_REPAIR: { icon: Wrench, tone: "warning" },
  DAMAGED: { icon: ShieldAlert, tone: "warning" },
  LOST: { icon: XCircle, tone: "destructive" },
  DISPOSED: { icon: XCircle, tone: "destructive" },
};
type Tone = "success" | "primary" | "warning" | "destructive";
const TONE_CLASS: Record<Tone, string> = {
  success: "text-success-700 bg-success/10 border-success/20",
  primary: "text-primary bg-primary/10 border-primary/20",
  warning: "text-warning-700 bg-warning/10 border-warning/20",
  destructive: "text-destructive bg-destructive/10 border-destructive/20",
};
const TONE_BAR: Record<Tone, string> = { success: "bg-success", primary: "bg-primary", warning: "bg-warning", destructive: "bg-destructive" };

// ── Piece-mode history timeline ──
type HistType = "DISPENSE" | "STATUS_CHANGE" | "MAINTENANCE";
const HIST_ICONS: Record<HistType, typeof Package> = { DISPENSE: ShoppingCart, STATUS_CHANGE: RefreshCw, MAINTENANCE: Wrench };
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

function maintTone(nextDate: string | null): Tone {
  if (!nextDate) return "primary";
  const diff = (new Date(nextDate).getTime() - Date.now()) / 86_400_000;
  if (diff < 0) return "destructive";
  if (diff <= 30) return "warning";
  return "success";
}

const fmtDate = (s: string) => new Date(s).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
const fmtDay = (s: string) => new Date(s).toLocaleDateString("th-TH");

// ════════════════════════════════════════
// Shell — one page, two modes (item / piece)
// ════════════════════════════════════════
export function ItemDetailShell({ itemId }: { itemId: string }) {
  // Single route /items/[id]. Copy selection is a ?copy= query so switching copies is a
  // shallow update (item not refetched, no remount) and still deep-linkable. Tracked items
  // always render a piece; non-tracked render item-mode.
  const router = useRouter();
  const searchParams = useSearchParams();
  const copy = searchParams.get("copy");
  const { user } = useSession();
  const canAct = user?.role === "ADMIN" || user?.role === "STAFF";

  const [item, setItem] = useState<ItemData | null>(null);
  const [sub, setSub] = useState<SubItemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [siblings, setSiblings] = useState<SiblingRow[]>([]);
  const [tab, setTab] = useState<string>("overview");
  // "item" = non-tracked aggregate; "piece" = tracked (a copy); "empty" = tracked with 0 subs.
  const [mode, setMode] = useState<"item" | "piece" | "empty">("item");

  // Shared dialog state
  const [maintOpen, setMaintOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<"AVAILABLE" | "DAMAGED" | "LOST" | "DISPOSED" | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  // Item-mode only
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustFixedReason, setAdjustFixedReason] = useState<string | null>(null);
  // Piece-mode only
  const [stationOpen, setStationOpen] = useState(false);
  const [returning, setReturning] = useState<string | null>(null); // subItemId being returned
  const [histFilter, setHistFilter] = useState<HistType | "">("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  // Fetch the item (spec) once per item. Non-tracked → item-mode; tracked → piece/empty.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const it = (await getItem(itemId)) as ItemData;
        if (cancelled) return;
        setItem(it);
        if (!it.trackIndividually) setMode("item");
        else if (it.subItems.length === 0) setMode("empty");
        else setMode("piece");
      } catch { if (!cancelled) setItem(null); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [itemId]);

  // Resolve the selected copy (?copy= validated against sub-items, else first).
  const selectedSubCode = item?.trackIndividually && item.subItems.length > 0
    ? (copy && item.subItems.some((s) => s.subCode === copy) ? copy : item.subItems[0].subCode)
    : null;
  const isMulti = (item?.subItems.length ?? 0) > 1;

  // Fetch the selected piece's detail (tracked only).
  useEffect(() => {
    if (mode !== "piece" || !selectedSubCode) { setSub(null); return; }
    let cancelled = false;
    (async () => {
      try { const s = (await getSubItem(itemId, selectedSubCode)) as SubItemData; if (!cancelled) setSub(s); } catch { if (!cancelled) setSub(null); }
    })();
    return () => { cancelled = true; };
  }, [mode, itemId, selectedSubCode]);

  // Refresh handlers (dialog onSuccess).
  const fetchItem = useCallback(async () => {
    try { setItem((await getItem(itemId)) as ItemData); } catch {}
  }, [itemId]);
  const fetchSub = useCallback(async () => {
    if (!selectedSubCode) return;
    try { setSub((await getSubItem(itemId, selectedSubCode)) as SubItemData); } catch {}
  }, [itemId, selectedSubCode]);

  // Switch copy via query (shallow — item not refetched).
  const selectCopy = (subCode: string) => router.replace(`/items/${itemId}?copy=${subCode}`, { scroll: false });

  // Reset tab + filters when switching copy.
  useEffect(() => { setTab("overview"); setHistFilter(""); }, [mode, itemId, selectedSubCode]);

  const { setDetail } = usePageHeader();
  useEffect(() => {
    const detail = mode === "piece"
      ? (sub ? (isMulti ? formatSubCode(sub.item.code, sub.subCode) : sub.item.code) : null)
      : (item?.code ?? null);
    setDetail(detail);
    return () => setDetail(null);
  }, [mode, isMulti, sub, item?.code, setDetail]);

  // Piece QR (1-copy → base code; ≥2 → full code)
  useEffect(() => {
    if (mode === "piece" && sub) QRCode.toDataURL(isMulti ? formatSubCode(sub.item.code, sub.subCode) : sub.item.code, { width: 128, margin: 1 }).then(setQrDataUrl).catch(() => {});
  }, [mode, isMulti, sub]);

  // Piece siblings
  const parentId = sub?.item.id;
  const fetchSiblings = useCallback(async () => {
    if (!parentId) return;
    try { setSiblings((await getSubItems(parentId)) as SiblingRow[]); } catch {}
  }, [parentId]);
  useEffect(() => { if (mode === "piece") fetchSiblings(); }, [mode, fetchSiblings]);

  const onReturn = async (subItemId?: string) => {
    if (!sub) return;
    const id = subItemId ?? sub.id;
    setReturning(id);
    try {
      await returnItem(sub.item.id, { subItemId: id });
      toast.success("คืนพัสดุย่อยแล้ว");
      await Promise.all([fetchSub(), fetchSiblings()]);
    } catch { toast.error("คืนไม่สำเร็จ"); }
    finally { setReturning(null); }
  };

  // ── Piece-mode derived (hooks run before early returns) ──
  const activeDispense = useMemo(() => sub?.dispenseRecords.find((d) => d.returnedAt === null) ?? null, [sub]);
  const historyEvents = useMemo<{ id: string; type: HistType; date: string; description: string; user: string }[]>(() => {
    if (!sub) return [];
    const dispense = sub.dispenseRecords.map((d) => ({ id: d.id, type: "DISPENSE" as const, date: d.dispensedAt, description: `เบิกออก${d.returnedAt ? " · คืนแล้ว" : ""}${d.usageNote ? ` · ${d.usageNote}` : ""}`, user: d.staff.name }));
    const status = sub.statusLogs.map((l) => ({ id: l.id, type: "STATUS_CHANGE" as const, date: l.changedAt, description: `${STATUS_LABELS[l.previousStatus] ?? l.previousStatus} → ${STATUS_LABELS[l.newStatus] ?? l.newStatus}${l.repairVenue && l.newStatus === "UNDER_REPAIR" ? ` · ส่งซ่อม${l.repairVenue === "EXTERNAL" ? "ภายนอก" : "ภายใน"}` : ""}${l.reason ? ` · ${l.reason}` : ""}`, user: l.changer.name }));
    const maint = sub.maintenanceRecords.map((r) => ({ id: r.id, type: "MAINTENANCE" as const, date: r.performedAt, description: `${labelFor(MAINT_TYPE_LABELS, r.type as MaintenanceType)} · ${labelFor(MAINT_RESULT_LABELS, r.result as MaintenanceResult)}${r.issue ? ` · ${r.issue}` : ""}`, user: r.performer.name }));
    return [...dispense, ...status, ...maint].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sub]);
  const filteredEvents = useMemo(() => (histFilter ? historyEvents.filter((e) => e.type === histFilter) : historyEvents), [historyEvents, histFilter]);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (mode === "empty") {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 animate-in fade-in duration-300">
        <div className="grid place-items-center size-16 rounded-2xl bg-muted text-muted-foreground"><Package className="size-8" /></div>
        <p className="text-muted-foreground font-medium">ยังไม่มีชิ้นย่อย — ตั้งค่า SubItem ก่อน</p>
        <Button variant="outline" onClick={() => router.push("/items")}><ArrowLeft className="h-4 w-4 mr-1" />กลับสู่รายการพัสดุ</Button>
      </div>
    );
  }
  if (mode === "item" && !item) return <NotFound label="ไม่พบพัสดุ" onBack={() => router.push("/items")} />;
  if (mode === "piece" && !sub) return <NotFound label="ไม่พบพัสดุย่อย" onBack={() => router.push("/items")} />;

  // ── Item-mode derived ──
  const stockStatus = item ? (() => {
    const s = item.minThreshold > 0
      ? item.availableQty < item.minThreshold ? { color: "bg-warning", label: "ต่ำ" } : { color: "bg-success", label: "ปกติ" }
      : { color: "bg-success", label: "ปกติ" };
    if (item.availableQty === 0) { s.color = "bg-destructive"; s.label = "หมด"; }
    return s;
  })() : null;

  const now = new Date();
  const expiredLots: { lotNumber: string; expiryDate: string }[] = [];
  const soonLots: { lotNumber: string; days: number }[] = [];
  for (const l of item?.lots ?? []) {
    if (!l.expiryDate) continue;
    const days = Math.floor((new Date(l.expiryDate).getTime() - now.getTime()) / 86_400_000);
    if (days < 0) expiredLots.push({ lotNumber: l.lotNumber, expiryDate: l.expiryDate });
    else if (days <= 60) soonLots.push({ lotNumber: l.lotNumber, days });
  }
  const hasExpiryAlert = expiredLots.length > 0 || soonLots.length > 0;

  // ── Tabs ──
  const itemTabs = item ? [
    { key: "overview", label: "ข้อมูลทั่วไป", icon: Info },
    { key: "media", label: "รูปภาพ", icon: ImageIcon, show: !!(item.imageUrl || (item.images?.length ?? 0) > 0) || !!canAct },
    { key: "history", label: "ประวัติ", icon: Clock },
    { key: "lost", label: "ประวัติสูญหาย", icon: SearchX },
    // Consumables are used up, never repaired. Everything else can be, so it gets the
    // tab — and a repair record forces it open regardless, so history is never hidden.
    { key: "maintenance", label: "การซ่อมบำรุง", icon: Wrench, show: item.category.profile?.dispenseType !== "CONSUMABLE" || item.maintenanceRecords.length > 0 },
    { key: "kit", label: `ชุดประกอบ${item.kitComponents?.length ? ` (${item.kitComponents.length})` : ""}`, icon: Boxes, show: !!(item.kitComponents?.length) },
  ].filter((t) => t.show !== false) : [];
  const pieceTabs = sub ? [
    { key: "overview", label: "ข้อมูลทั่วไป", icon: Info },
    { key: "media", label: "รูปภาพ", icon: ImageIcon, show: !!(sub.imageUrl || (sub.images?.length ?? 0) > 0) || !!canAct },
    { key: "subcodes", label: `รหัสย่อย (${siblings.length})`, icon: Hash, show: siblings.length > 1 },
    { key: "history", label: "ประวัติ", icon: Clock },
    { key: "lost", label: "ประวัติสูญหาย", icon: SearchX },
    { key: "maintenance", label: `การซ่อมบำรุง${sub.maintenanceRecords.length ? ` (${sub.maintenanceRecords.length})` : ""}`, icon: Wrench, show: sub.item.category.profile?.dispenseType !== "CONSUMABLE" || sub.maintenanceRecords.length > 0 },
  ].filter((t) => t.show !== false) : [];
  const tabs = mode === "item" ? itemTabs : pieceTabs;

  return (
    <div>
      <div className="max-w-6xl">
        {/* ── Item-mode expiry alerts ── */}
        {mode === "item" && hasExpiryAlert && (
          <div className="mb-6 space-y-2">
            {expiredLots.length > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
                <XCircle className="size-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm min-w-0">
                  <span className="font-semibold text-destructive">หมดอายุแล้ว ({expiredLots.length})</span>
                  <span className="text-muted-foreground ml-2">
                    {expiredLots.map((l) => `${lotDisplay(l.lotNumber)} · ${new Date(l.expiryDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}`).join("  ·  ")}
                  </span>
                </div>
              </div>
            )}
            {soonLots.length > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
                <AlertTriangle className="size-5 text-warning-700 shrink-0 mt-0.5" />
                <div className="text-sm min-w-0">
                  <span className="font-semibold text-warning-700">ใกล้หมดอายุ ({soonLots.length})</span>
                  <span className="text-muted-foreground ml-2">
                    {soonLots.map((l) => `${lotDisplay(l.lotNumber)} · ใน ${l.days} วัน`).join("  ·  ")}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Hero card ── */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          {mode === "item" && item && stockStatus ? (
            <ItemHero item={item} stockStatus={stockStatus} />
          ) : sub ? (
            <PieceHero sub={sub} isMulti={isMulti} siblingCount={siblings.length} siblingStatuses={siblings.map((s) => s.status)}
              // Return lives in the รหัสย่อย table when there is one; a lone piece has no
              // such tab, so it keeps the hero button.
              canAct={canAct && siblings.length <= 1} activeLoan={activeDispense} onReturn={() => onReturn()} returning={returning === sub.id} />
          ) : null}

          {/* ── Tab bar (shared) ── */}
          <div className="border-t border-border px-2 sm:px-6 flex items-center gap-1 bg-muted/30 overflow-x-auto">
            {tabs.map((t) => (
              <TabBtn key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} icon={t.icon}>
                {t.label}
              </TabBtn>
            ))}
          </div>
        </section>

        {/* ── Tab content ── */}
        <div className="mt-5 animate-in fade-in duration-200" key={`${mode}-${tab}`}>
          {/* ── ITEM MODE ── */}
          {mode === "item" && item && (
            <>
              {tab === "overview" && (
                <ItemDetailOverview
                  item={item}
                  userRole={user?.role || ""}
                  onAdjust={() => setAdjustOpen(true)}
                  onReportDamage={() => {
                    if (item.trackIndividually) setStatusAction("DAMAGED");
                    else { setAdjustFixedReason("DAMAGED_PENDING_REPAIR"); setAdjustOpen(true); }
                  }}
                  onReportStatus={(s) => setStatusAction(s)}
                  onEdit={() => setEditOpen(true)}
                  onRefresh={fetchItem}
                />
              )}
              {tab === "media" && (
                <ItemDetailMedia item={{ id: item.id, imageUrl: item.imageUrl, images: item.images }} canAct={!!canAct} onRefresh={fetchItem} />
              )}
              {tab === "history" && <ItemDetailHistory itemId={item.id} />}
              {tab === "lost" && <ItemDetailLostHistory itemId={item.id} itemCode={item.code} isMulti={isMulti} onSuccess={fetchItem} />}
              {tab === "maintenance" && (
                <ItemDetailMaintenance item={item} maintenanceRecords={item.maintenanceRecords} canAct={!!canAct} showAssetInfo={!!item.category.profile?.assetTracking} onRecordMaintenance={() => setMaintOpen(true)} />
              )}
              {tab === "kit" && item.kitComponents.length > 0 && <KitComponentsTab components={item.kitComponents} />}
            </>
          )}

          {/* ── PIECE MODE ── */}
          {mode === "piece" && sub && (
            <>
              {tab === "overview" && (
                <PieceOverview
                  sub={sub}
                  isMulti={isMulti}
                  canAct={canAct}
                  qrDataUrl={qrDataUrl}
                  onStation={() => setStationOpen(true)}
                  onReportDamage={() => setStatusAction("DAMAGED")}
                  onStatus={(s) => setStatusAction(s)}
                  onEdit={() => setEditOpen(true)}
                  onReceive={() => router.push(`/receive?item=${sub.item.id}`)}
                />
              )}
              {tab === "media" && (
                <ItemDetailMedia item={{ id: sub.id, imageUrl: sub.imageUrl, images: sub.images }} canAct={!!canAct} onRefresh={fetchSub} onSave={(id, data) => updateSubItemFields(sub.item.id, id, data)} />
              )}
              {tab === "subcodes" && (
                <SubCodesTable
                  rows={siblings} itemCode={sub.item.code} itemLocation={sub.item.location} currentId={sub.id} canAct={canAct}
                  returning={returning} onSelect={selectCopy} onReturn={onReturn}
                />
              )}
              {tab === "lost" && <ItemDetailLostHistory itemId={sub.item.id} itemCode={sub.item.code} isMulti={isMulti} onSuccess={fetchSub} />}
              {tab === "history" && (
                <section className="rounded-2xl border border-border bg-card overflow-hidden">
                  <SectionHeader eyebrow="กิจกรรม" title="ประวัติ" />
                  <div className="px-4 sm:px-5 pt-4 flex items-center gap-2 overflow-x-auto">
                    <span className="text-sm text-muted-foreground shrink-0">Type:</span>
                    {HIST_CHIPS.map((chip) => {
                      const active = histFilter === chip.value;
                      return (
                        <button key={chip.value} className={cn("px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition-colors", active ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground border-border hover:text-foreground hover:bg-muted")} onClick={() => setHistFilter(chip.value)}>
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                  {filteredEvents.length === 0 ? (
                    <p className="text-center py-10 text-sm text-muted-foreground">ไม่มีรายการในหมวดนี้</p>
                  ) : (
                    <ol className="p-4 sm:p-5 space-y-3">
                      {filteredEvents.map((e) => {
                        const Icon = HIST_ICONS[e.type] || Package;
                        return (
                          <li key={`${e.type}-${e.id}`} className="grid grid-cols-[auto_1fr] gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-border bg-muted/20">
                            <div className="size-10 shrink-0 rounded-lg bg-primary/5 border border-primary/10 grid place-items-center text-primary"><Icon className="size-4" /></div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase border", HIST_BADGE[e.type])}>{labelFor(EVENT_TYPE_LABELS, e.type)}</span>
                                <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><CalendarDays className="size-3" />{fmtDate(e.date)}</span>
                              </div>
                              <p className="text-sm font-medium">{e.description}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1"><User2 className="size-3" /> by {e.user}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>
              )}
              {tab === "maintenance" && (
                <PieceMaintenance sub={sub} canAct={canAct} onRecord={() => setMaintOpen(true)} />
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Item-mode dialogs ── */}
      {mode === "item" && item && (
        <>
          <StockAdjustmentDialog
            open={adjustOpen}
            onOpenChange={(o) => { setAdjustOpen(o); if (!o) { setAdjustFixedReason(null); } }}
            fixedReason={adjustFixedReason ?? undefined}
            trackIndividually={item.trackIndividually}
            itemId={item.id} itemCode={item.code}
            availableQty={item.availableQty} totalQty={item.totalQty} unit={item.issueUnit.name}
            checkedOutCount={item.trackIndividually ? item.subItems.filter((s) => s.status === "ON_LOAN").length : item.totalQty - item.availableQty}
            onSuccess={fetchItem}
          />
          <ReportStatusDialog
            open={statusAction !== null}
            onOpenChange={(o) => { if (!o) setStatusAction(null); }}
            itemId={item.id} itemCode={item.code} status={statusAction ?? "DAMAGED"}
            trackIndividually={item.trackIndividually} subItems={item.subItems} onSuccess={fetchItem}
          />
          <MaintenanceFormDialog open={maintOpen} onOpenChange={setMaintOpen} itemId={item.id} maintenanceCycleMonths={item.maintenanceCycleMonths} onSuccess={fetchItem} />
          <EditItemDialog open={editOpen} itemId={item.id} onOpenChange={setEditOpen} onSaved={fetchItem} />
        </>
      )}

      {/* ── Piece-mode dialogs ── */}
      {mode === "piece" && sub && (
        <>
          <MaintenanceFormDialog open={maintOpen} onOpenChange={setMaintOpen} itemId={sub.item.id} itemLabel={sub.item.name} subItemId={sub.id} subItemLabel={isMulti ? formatSubCode(sub.item.code, sub.subCode) : sub.item.code} onSuccess={fetchSub} />
          <ReportStatusDialog open={statusAction !== null} onOpenChange={(o) => { if (!o) setStatusAction(null); }} itemId={sub.item.id} itemCode={sub.item.code} status={statusAction ?? "DAMAGED"} trackIndividually subItems={[{ id: sub.id, subCode: sub.subCode, status: sub.status }]} onSuccess={fetchSub} />
          <EditItemDialog open={editOpen} itemId={sub.item.id} subItem={{ id: sub.id, serialNumber: sub.serialNumber, condition: sub.condition, notes: sub.notes, locationId: sub.location?.id ?? null }} onOpenChange={setEditOpen} onSaved={fetchSub} />
          <StationInRoomDialog open={stationOpen} onOpenChange={setStationOpen} itemId={sub.item.id} itemCode={sub.item.code} itemName={sub.item.name} subItemId={sub.id} onSuccess={fetchSub} />
        </>
      )}
    </div>
  );
}

// ── Not found ──
function NotFound({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 animate-in fade-in duration-300">
      <div className="grid place-items-center size-16 rounded-2xl bg-muted text-muted-foreground"><XCircle className="size-8" /></div>
      <p className="text-muted-foreground font-medium">{label}</p>
      <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />กลับสู่รายการพัสดุ</Button>
    </div>
  );
}

// ── Shared tab button ──
function TabBtn({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("relative inline-flex items-center gap-2 px-3 sm:px-4 py-3.5 text-sm transition-colors whitespace-nowrap", active ? "text-primary font-medium" : "text-muted-foreground hover:text-foreground")}>
      <Icon className="size-4 shrink-0" />
      {children}
      {active && <motion.span layoutId="item-detail-tab" transition={{ type: "spring", stiffness: 450, damping: 35 }} className="absolute inset-x-3 -bottom-px h-0.5 bg-primary rounded-full" />}
    </button>
  );
}

// ── Shared section header ──
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

// ── Item hero ──
function ItemHero({ item, stockStatus }: { item: ItemData; stockStatus: { color: string; label: string } }) {
  const coverSrc = item.imageUrl ?? item.images?.[0] ?? null;
  return (
    <div className="grid gap-5 sm:gap-6 lg:gap-8 p-4 sm:p-6 grid-cols-1 md:grid-cols-[auto_1fr] xl:grid-cols-[auto_1fr_auto]">
      <div className="relative w-full md:w-48 lg:w-56 aspect-square rounded-xl overflow-hidden ring-1 ring-border bg-muted shadow-sm">
        <img src={coverSrc ?? pic(item.code, 640, 480)} alt={item.name} className="size-full object-cover" />
        <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wider font-semibold bg-background/90 px-2 py-0.5 rounded-full backdrop-blur-sm">Cover</span>
      </div>
      <div className="flex flex-col justify-between min-w-0 py-1">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">{item.category.profile?.name ?? item.category.name}</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-muted-foreground">{item.code}</span>
            <span className="text-muted-foreground">·</span>
            <span className="inline-flex items-center gap-1.5"><span className={cn("size-1.5 rounded-full", stockStatus.color)} /><span className="text-muted-foreground">{stockStatus.label}</span></span>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold leading-tight tracking-tight text-balance break-words">{item.name}</h1>
          {item.nameEn && <p className="text-muted-foreground mt-2 text-sm italic">{item.nameEn}</p>}
          {item.description && <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{item.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <span className="text-xs px-2.5 py-1 rounded-md bg-muted border border-border text-muted-foreground">หน่วย <span className="text-foreground font-medium">{item.issueUnit.name}</span></span>
          {item.location && <span className="text-xs px-2.5 py-1 rounded-md bg-muted border border-border text-muted-foreground">{locationLabel(item.location)}</span>}
        </div>
      </div>
      <StockSummary status={item.status} available={item.availableQty} total={item.totalQty} unit={item.issueUnit.name} minThreshold={item.minThreshold} dispenseType={item.category.profile?.dispenseType ?? "COUNT"} />
    </div>
  );
}

// ── Piece hero (breadcrumb + cover + title + status summary) ──
function PieceHero({ sub, isMulti, siblingCount, siblingStatuses, canAct, activeLoan, onReturn, returning }: {
  sub: SubItemData; isMulti: boolean; siblingCount: number; siblingStatuses: ItemStatus[]; canAct: boolean; activeLoan: DispenseRecord | null; onReturn: () => void; returning: boolean;
}) {
  const fullCode = isMulti ? formatSubCode(sub.item.code, sub.subCode) : sub.item.code;
  const loc = sub.location ?? sub.item.location;
  const cover = sub.imageUrl ?? sub.images?.[0] ?? sub.item.imageUrl ?? null;
  return (
    <div className="p-4 sm:p-6">
      <div className="grid gap-5 sm:gap-6 lg:gap-8 grid-cols-1 md:grid-cols-[auto_1fr] xl:grid-cols-[auto_1fr_auto]">
        <div className="relative w-full md:w-48 lg:w-56 aspect-square rounded-xl overflow-hidden ring-1 ring-border bg-muted shadow-sm">
          <img src={cover ?? pic(fullCode, 640, 480)} alt={sub.name ?? fullCode} className="size-full object-cover" />
          <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wider font-semibold bg-background/90 px-2 py-0.5 rounded-full backdrop-blur-sm">Cover</span>
        </div>
        <div className="flex flex-col justify-between min-w-0 py-1">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">{sub.item.category.profile?.name ?? sub.item.category.name}</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-muted-foreground">{fullCode}</span>
              {isMulti && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-muted-foreground border border-border text-[11px]">spec {sub.item.code} · {siblingCount} ชิ้น</span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold leading-tight tracking-tight text-balance break-words">{sub.name ?? sub.item.name}</h1>
            {sub.item.nameEn && <p className="text-muted-foreground mt-2 text-sm italic">{sub.item.nameEn}</p>}
            {sub.notes && <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{sub.notes}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {sub.condition && <span className="text-xs px-2.5 py-1 rounded-md bg-muted border border-border text-muted-foreground">สภาพ <span className="text-foreground font-medium">{CONDITION_LABELS[sub.condition] ?? sub.condition}</span></span>}
            {sub.serialNumber && <span className="text-xs px-2.5 py-1 rounded-md bg-muted border border-border text-muted-foreground font-mono">S/N <span className="text-foreground font-medium">{sub.serialNumber}</span></span>}
            <span className="text-xs px-2.5 py-1 rounded-md bg-muted border border-border text-muted-foreground">หน่วย <span className="text-foreground font-medium">{sub.item.issueUnit.name}</span></span>
            <span className="text-xs px-2.5 py-1 rounded-md bg-muted border border-border text-muted-foreground">{loc ? locationLabel(loc) : "ไม่ระบุที่ตั้ง"}</span>
          </div>
        </div>
        <StatusSummary status={sub.status} siblingStatuses={siblingStatuses} activeLoan={activeLoan} canAct={canAct} onReturn={onReturn} returning={returning} />
      </div>
    </div>
  );
}

// ── Stock summary (item hero right slot) ──
// Item-mode (non-tracked) status card. COUNT (วัสดุคงทน ยืม-คืน) surfaces real stock
// state — partial-on-loan is meaningful, so it shows headline + available/total + proportion
// bar. CONSUMABLE/ITEM only deplete, so they show a fixed "พร้อมใช้งาน" + available count.
// A manually set status (ชำรุด/ส่งซ่อม/สูญหาย/ตัดจำหน่าย) overrides the derived headline.
function StockSummary({ status, available, total, unit, minThreshold, dispenseType }: {
  status: ItemStatus; available: number; total: number; unit: string; minThreshold: number; dispenseType: "CONSUMABLE" | "COUNT" | "ITEM";
}) {
  const isCount = dispenseType === "COUNT";
  const manual = status !== "AVAILABLE" && status !== "ON_LOAN";
  const STOCK_HEADLINE: Record<NonTrackedStockKey, { icon: typeof CheckCircle2; tone: Tone }> = {
    AVAILABLE: { icon: CheckCircle2, tone: "success" },
    ON_LOAN: { icon: Undo2, tone: "primary" },
    OUT: { icon: XCircle, tone: "destructive" },
  };
  const key: NonTrackedStockKey = isCount ? nonTrackedStockKey(dispenseType, available, total) : "AVAILABLE";
  const manualMeta = STATUS_META[status] ?? { icon: Info, tone: "primary" as Tone };
  const { icon: Icon, tone } = manual ? manualMeta : STOCK_HEADLINE[key];
  const label = manual ? (STATUS_LABELS[status] ?? status.replace(/_/g, " ")) : NON_TRACKED_STOCK_LABELS[key];

  // Low-stock alert only (out-of-stock is the headline itself).
  const isLow = minThreshold > 0 && available > 0 && available < minThreshold;
  const stockTag = isLow
    ? { label: "เหลือน้อย", dot: "bg-warning", cls: "bg-warning/10 text-warning-700 border-warning/20" }
    : null;

  const used = Math.max(0, total - available);
  const segments: { key: string; label: string; bar: string; dot: string; count: number }[] = [];
  if (available > 0) segments.push({ key: "AVAILABLE", ...STOCK_STATUS_META.AVAILABLE, count: available });
  if (isCount && used > 0) segments.push({ key: "ON_LOAN", ...STOCK_STATUS_META.ON_LOAN, count: used });

  return (
    <div className="w-full xl:w-72 rounded-xl bg-gradient-to-br from-muted/50 to-card border border-border p-5 md:col-span-2 xl:col-span-1">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">สถานะปัจจุบัน</div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className={cn("size-12 grid place-items-center rounded-xl border", TONE_CLASS[tone])}><Icon className="size-6" /></span>
        <span className="text-3xl font-semibold leading-none">{label}</span>
        {stockTag && (
          <span className={cn("ml-auto inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border", stockTag.cls)}>
            <span className={cn("size-1.5 rounded-full", stockTag.dot)} />{stockTag.label}
          </span>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs"><span className="text-muted-foreground">{isCount ? "สัดส่วนการใช้งาน" : "คงเหลือ"}</span><span className="text-muted-foreground tabular-nums">{isCount ? `${available}/${total}` : available} {unit}</span></div>
      <div className="mt-2 flex h-2.5 rounded-full overflow-hidden bg-muted">
        {segments.map((s) => (<div key={s.key} className={cn("h-full", s.bar)} style={{ width: `${isCount ? (total > 0 ? (s.count / total) * 100 : 0) : (s.count > 0 ? 100 : 0)}%` }} title={`${s.label}: ${s.count}`} />))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {segments.map((s) => (<div key={s.key} className="flex items-center gap-1.5 text-xs min-w-0"><span className={cn("size-2 rounded-full shrink-0", s.dot)} /><span className="text-muted-foreground truncate">{s.label}</span><span className="ml-auto font-semibold tabular-nums">{s.count}</span></div>))}
      </div>
    </div>
  );
}

// ── Status summary (piece hero right slot) ──
// Fleet breakdown across sibling pieces, excluding written-off (LOST/DISPOSED).
function StatusSummary({ status, siblingStatuses, activeLoan, canAct, onReturn, returning }: { status: ItemStatus; siblingStatuses: ItemStatus[]; activeLoan: DispenseRecord | null; canAct: boolean; onReturn: () => void; returning: boolean }) {
  const meta = STATUS_META[status] ?? { icon: Info, tone: "primary" as Tone };
  const tone = meta.tone;
  const Icon = meta.icon;
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, " ");
  const isOnLoan = status === "ON_LOAN" && activeLoan;

  // ponytail: LOST/DISPOSED are written off — excluded from the fleet total and breakdown.
  // DAMAGED/UNDER_REPAIR/etc stay (still on the books). Headline still shows the current
  // piece's true status even when it's LOST/DISPOSED.
  const HIDDEN = new Set<string>(["LOST", "DISPOSED"]);
  const visible = siblingStatuses.filter((s) => !HIDDEN.has(s));
  const total = visible.length;
  const counts: Record<string, number> = {};
  for (const s of visible) counts[s] = (counts[s] ?? 0) + 1;
  const segments: { key: string; label: string; bar: string; dot: string; count: number }[] = [];
  for (const key of STOCK_STATUS_ORDER) if (counts[key]) segments.push({ key, ...STOCK_STATUS_META[key], count: counts[key] });
  for (const [key, count] of Object.entries(counts)) if (!STOCK_STATUS_ORDER.includes(key)) segments.push({ key, label: key.replace(/_/g, " "), bar: "bg-muted-foreground", dot: "bg-muted-foreground", count });
  const statusHidden = HIDDEN.has(status);
  const currentCount = counts[status] ?? 0;

  return (
    <div className="w-full xl:w-72 rounded-xl bg-gradient-to-br from-muted/50 to-card border border-border p-5 md:col-span-2 xl:col-span-1">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">สถานะปัจจุบัน</div>
      <div className="mt-3 flex items-center gap-3">
        <span className={cn("size-12 grid place-items-center rounded-xl border", TONE_CLASS[tone])}><Icon className="size-6" /></span>
        <span className="text-3xl font-semibold leading-none">{label}</span>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs"><span className="text-muted-foreground">สัดส่วนการใช้งาน</span><span className="text-muted-foreground">{!statusHidden && total > 0 ? `${currentCount}/${total} ชิ้น` : isOnLoan ? "กำลังยืมอยู่" : label}</span></div>
      {total > 0 ? (
        <>
          <div className="mt-2 flex h-2.5 rounded-full overflow-hidden bg-muted">
            {segments.map((s) => (<div key={s.key} className={cn("h-full", s.bar)} style={{ width: `${total > 0 ? (s.count / total) * 100 : 0}%` }} title={`${s.label}: ${s.count}`} />))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {segments.map((s) => (
              <div key={s.key} className={cn("flex items-center gap-1.5 text-xs min-w-0", s.key === status && "font-semibold")}>
                <span className={cn("size-2 rounded-full shrink-0", s.dot)} />
                <span className={cn("truncate", s.key === status ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
                <span className="ml-auto tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-2 flex h-2.5 rounded-full overflow-hidden bg-muted"><div className={cn("h-full", TONE_BAR[tone])} style={{ width: "100%" }} /></div>
      )}
      {isOnLoan && (
        <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="text-xs text-muted-foreground">ผู้ยืม</div>
          <div className="font-medium text-primary mt-0.5">→ {activeLoan!.staff.name}</div>
          {canAct && <Button size="sm" variant="outline" className="mt-2 w-full" onClick={onReturn} disabled={returning}><Undo2 className="h-3.5 w-3.5 mr-1" />คืนพัสดุ</Button>}
        </div>
      )}
    </div>
  );
}

// ── Piece overview tab (detail rows + manage tiles + QR) ──
function PieceOverview({ sub, isMulti, canAct, qrDataUrl, onStation, onReportDamage, onStatus, onEdit, onReceive }: {
  sub: SubItemData; isMulti: boolean; canAct: boolean; qrDataUrl: string;
  onStation: () => void; onReportDamage: () => void; onStatus: (s: "LOST" | "DISPOSED") => void; onEdit: () => void; onReceive: () => void;
}) {
  const [printOpen, setPrintOpen] = useState(false);
  const fullCode = isMulti ? formatSubCode(sub.item.code, sub.subCode) : sub.item.code;
  // Each piece carries its own label, so it prints its own code — not the parent item's.
  const printItems: QrPrintItem[] = [{ code: fullCode, name: sub.name ?? sub.item.name }];
  const loc = sub.location ?? sub.item.location;
  const detailRows: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; mono?: boolean }[] = [
    { icon: Hash, label: "รหัส", value: fullCode, mono: true },
    { icon: Tag, label: "ชื่อ", value: sub.name ?? sub.item.name },
    { icon: FolderTree, label: "ประเภท", value: sub.item.category.profile?.name ?? sub.item.category.name },
    { icon: Layers, label: "หมวดหมู่", value: sub.item.category.name },
    { icon: Hash, label: "สถานะ", value: STATUS_LABELS[sub.status] ?? sub.status.replace(/_/g, " ") },
    ...(sub.condition ? [{ icon: ClipboardList, label: "สภาพ", value: CONDITION_LABELS[sub.condition] ?? sub.condition }] : []),
    ...(sub.serialNumber ? [{ icon: Hash, label: "หมายเลขซีเรียล", value: sub.serialNumber, mono: true }] : []),
    { icon: Layers, label: "หน่วยเบิก", value: sub.item.issueUnit.name },
    { icon: MapPin, label: "ที่ตั้ง", value: loc ? locationLabel(loc) : "-" },
    { icon: Clock, label: "วันที่สร้าง", value: fmtDay(sub.createdAt) },
  ];

  // withPrint=false for staff — they print from the พิมพ์ QR tile in the manage grid.
  const qrBlock = (withPrint: boolean) => (
    <div className="border-t border-border p-4 sm:p-5 grid grid-cols-[auto_1fr] gap-4 sm:gap-5 items-center bg-muted/20">
      <div className="size-20 sm:size-24 shrink-0 rounded-xl border border-border bg-card p-2 grid place-items-center">
        {qrDataUrl ? <img src={qrDataUrl} alt={`QR for ${fullCode}`} className="size-full rounded-md" /> : <QrCode className="size-12 text-foreground animate-pulse" />}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">QR code</div>
        <div className="text-sm text-muted-foreground mt-1 truncate">สแกนเพื่อค้นหาพัสดุย่อย</div>
        <div className="font-mono text-sm font-semibold mt-0.5 truncate">{fullCode}</div>
        {withPrint && (
          <button
            onClick={() => setPrintOpen(true)}
            className="inline-flex items-center gap-1.5 mt-2 text-xs px-2.5 py-1.5 rounded-md border border-border bg-card hover:bg-muted transition-colors"
          >
            <Printer className="size-3.5" /> พิมพ์
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-5 items-start">
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <SectionHeader eyebrow="ข้อมูลพัสดุย่อย" title="รายละเอียด" />
          <div className="divide-y divide-border">
            {detailRows.map((d, i) => {
              const Icon = d.icon;
              return (
                <div key={i} className={cn("grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5", i % 2 === 1 && "bg-muted/30")}>
                  <span className="size-8 shrink-0 rounded-lg bg-primary/5 border border-primary/10 grid place-items-center text-primary"><Icon className="size-4" /></span>
                  <span className="text-sm text-muted-foreground min-w-0 truncate">{d.label}</span>
                  <span className={cn("text-sm text-foreground font-medium text-right min-w-0 truncate", d.mono && "font-mono")}>{d.value}</span>
                </div>
              );
            })}
          </div>
        </div>

        {canAct ? (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <SectionHeader eyebrow="การจัดการ" title="จัดการสต็อก" />
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <ActionTile icon={Home} label="นำไปใช้งาน" tone="default" onClick={onStation} disabled={!canTransition(sub.status, "IN_USE")} />
              <ActionTile icon={ArrowDownToLine} label="รับเข้าใหม่" tone="default" onClick={onReceive} />
              <DropdownMenu>
                <DropdownMenuTrigger render={<ActionTile icon={Package} label="ปรับสต็อก" tone="default" />} />
                <DropdownMenuContent align="start">
                  {/* Off-normal moves must respect the lifecycle order (e.g. can't lose a piece
                      that's already ส่งซ่อม); server enforces it too, this just hides dead options. */}
                  <DropdownMenuItem disabled={!canTransition(sub.status, "LOST")} onClick={() => onStatus("LOST")}><SearchX className="size-4" />สูญหาย</DropdownMenuItem>
                  <DropdownMenuItem disabled={!canTransition(sub.status, "DISPOSED")} onClick={() => onStatus("DISPOSED")}><Trash2 className="size-4" />ตัดจำหน่าย</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ActionTile icon={Flag} label="แจ้งชำรุด" tone="destructive" onClick={onReportDamage} disabled={!canTransition(sub.status, "DAMAGED")} />
              <ActionTile icon={Pencil} label="แก้ไขข้อมูล" tone="default" onClick={onEdit} />
              <ActionTile icon={Printer} label="พิมพ์ QR Code" tone="default" onClick={() => setPrintOpen(true)} />
            </div>
            {qrBlock(false)}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <SectionHeader title="QR code" />
            {qrBlock(true)}
          </div>
        )}
      </section>
      <QrPrintDialog open={printOpen} onClose={() => setPrintOpen(false)} items={printItems} />
    </div>
  );
}

// ── Sub-codes tab (table: status + who/where + return) ──
// StationInRoomDialog folds the room into notes as "ห้องที่ตั้ง: X", so an IN_USE piece
// reads its room back out of there and falls back to its assigned location.
const roomFromNotes = (notes: string | null | undefined) => notes?.match(/ห้องที่ตั้ง:\s*([^|]+)/)?.[1].trim() || null;

function SubCodesTable({ rows, itemCode, itemLocation, currentId, canAct, returning, onSelect, onReturn }: {
  rows: SiblingRow[]; itemCode: string; itemLocation: LocationType | null; currentId: string; canAct: boolean;
  returning: string | null; onSelect: (subCode: string) => void; onReturn: (subItemId: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <SectionHeader eyebrow="spec เดียวกัน" title={`ชิ้นอื่นใน spec (${rows.length})`} />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 [&>th]:h-9 [&>th]:py-0 [&>th]:text-xs [&>th]:text-muted-foreground">
              <TableHead className="w-40 px-3">รหัส</TableHead>
              <TableHead className="w-36 px-3">สถานะ</TableHead>
              <TableHead className="px-3">รายละเอียด</TableHead>
              <TableHead className="w-28 px-3" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => {
              const isCurrent = s.id === currentId;
              const meta = STOCK_STATUS_META[s.status];
              const loan = s.dispenseRecords[0] ?? null;
              const room = roomFromNotes(loan?.notes);
              // Same fallback as the hero: a piece with no location of its own sits where its spec sits.
              const loc = s.location ?? itemLocation;
              const where = room ?? (loc ? locationLabel(loc) : null);
              return (
                <TableRow key={s.id} onClick={() => onSelect(s.subCode)}
                  className={cn("cursor-pointer [&>td]:py-2.5", isCurrent && "bg-primary/10 hover:bg-primary/15")}>
                  <TableCell className={cn("font-mono text-sm px-3 relative", isCurrent && "font-semibold text-primary before:absolute before:left-0 before:inset-y-0 before:w-1 before:bg-primary")}>
                    {formatSubCode(itemCode, s.subCode)}
                    {isCurrent && <span className="ml-2 align-middle inline-flex items-center px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-sans font-semibold tracking-wide">กำลังดู</span>}
                  </TableCell>
                  <TableCell className="px-3">
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span className={cn("size-1.5 rounded-full shrink-0", meta?.dot ?? "bg-muted-foreground")} />
                      {meta?.label ?? STATUS_LABELS[s.status] ?? s.status.replace(/_/g, " ")}
                    </span>
                  </TableCell>
                  <TableCell className="px-3 text-sm text-muted-foreground">
                    {s.status === "ON_LOAN" && loan ? (
                      <span><User2 className="size-3 inline mr-1 -mt-0.5" />{loan.recipient || loan.staff.name} · {fmtDate(loan.dispensedAt)}</span>
                    ) : s.status === "IN_USE" ? (
                      <span><MapPin className="size-3 inline mr-1 -mt-0.5" />{where ?? "ไม่ระบุที่ตั้ง"}{loan ? ` · ${fmtDay(loan.dispensedAt)}` : ""}</span>
                    ) : where ? (
                      <span><MapPin className="size-3 inline mr-1 -mt-0.5" />{where}</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="px-3 text-right">
                    {canAct && s.status === "ON_LOAN" && (
                      <Button size="sm" variant="outline" disabled={returning === s.id}
                        onClick={(e) => { e.stopPropagation(); onReturn(s.id); }}>
                        <Undo2 className="h-3.5 w-3.5 mr-1" />รับคืน
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

// ── Piece maintenance tab ──
function PieceMaintenance({ sub, canAct, onRecord }: { sub: SubItemData; canAct: boolean; onRecord: () => void }) {
  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <SectionHeader eyebrow="ซ่อมบำรุง" title="แผน & ประวัติซ่อมบำรุง" right={canAct ? <Button onClick={onRecord}><Wrench className="h-4 w-4 mr-1.5" />บันทึกการบำรุงรักษา</Button> : undefined} />
      <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 border-b border-border">
        <StatCard label="รอบถัดไป" value={sub.nextMaintenanceDate ? fmtDay(sub.nextMaintenanceDate) : "—"} icon={CalendarDays} tone={maintTone(sub.nextMaintenanceDate)} />
        <StatCard label="จำนวนการซ่อมบำรุง" value={`${sub.maintenanceRecords.length} ครั้ง`} icon={Wrench} />
        <StatCard label="สถานะปัจจุบัน" value={STATUS_LABELS[sub.status] ?? sub.status.replace(/_/g, " ")} icon={ShieldAlert} tone={STATUS_META[sub.status]?.tone ?? "primary"} />
      </div>
      {/* Shown for every profile that reaches this tab — consumables never do. */}
      <div className="p-4 sm:p-5 border-b border-border">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">ข้อมูลการบำรุงรักษา</div>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <div><dt className="text-muted-foreground text-xs">รอบบำรุงรักษา</dt><dd className="font-medium mt-0.5">{sub.item.maintenanceCycleMonths ? `${sub.item.maintenanceCycleMonths} เดือน` : "—"}</dd></div>
          <div><dt className="text-muted-foreground text-xs">บำรุงล่าสุด</dt><dd className="font-medium mt-0.5">{sub.lastMaintenanceDate ? fmtDay(sub.lastMaintenanceDate) : sub.maintenanceRecords[0] ? fmtDay(sub.maintenanceRecords[0].performedAt) : "—"}</dd></div>
          <div><dt className="text-muted-foreground text-xs">รอบถัดไป</dt><dd className="font-medium mt-0.5">{sub.nextMaintenanceDate ? fmtDay(sub.nextMaintenanceDate) : "—"}</dd></div>
        </dl>
      </div>
      <div className="p-4 sm:p-5">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">ประวัติการซ่อมบำรุง</div>
        {sub.maintenanceRecords.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted-foreground">ยังไม่มีประวัติการซ่อมบำรุง</p>
        ) : (
          <ul className="space-y-3">
            {sub.maintenanceRecords.map((rec) => (
              <li key={rec.id} className="grid grid-cols-[auto_1fr] gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-border bg-muted/20">
                <div className="size-10 shrink-0 rounded-lg bg-primary/5 border border-primary/10 grid place-items-center text-primary"><Wrench className="size-4" /></div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><CalendarDays className="size-3" />{fmtDay(rec.performedAt)}</span>
                    <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full border bg-muted text-foreground border-border">{labelFor(MAINT_TYPE_LABELS, rec.type as MaintenanceType)}</span>
                    <span className={cn("text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full border", rec.result === "AVAILABLE" ? "bg-success/10 text-success-700 border-success/20" : "bg-primary/10 text-primary border-primary/20")}>{labelFor(MAINT_RESULT_LABELS, rec.result as MaintenanceResult)}</span>
                  </div>
                  {rec.issue && <div className="text-sm font-medium mt-1">{rec.issue}</div>}
                  {rec.description && <div className="text-sm text-muted-foreground mt-0.5">{rec.description}</div>}
                  <div className="text-xs text-muted-foreground mt-0.5">โดย {rec.performer.name}{rec.cost != null ? ` · ฿${rec.cost.toLocaleString()}` : ""}</div>
                  {rec.attachmentUrls.length > 0 && (
                    <div className="flex gap-2 mt-1.5">
                      {rec.attachmentUrls.map((url, i) => (<a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">{url.endsWith(".pdf") ? `PDF ${i + 1}` : `รูป ${i + 1}`}</a>))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ── Stat card (piece maintenance) ──
function StatCard({ label, value, icon: Icon, tone = "primary" }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; tone?: Tone }) {
  const toneClass = {
    primary: "bg-primary/5 text-primary border-primary/10",
    success: "bg-success/10 text-success-700 border-success/20",
    warning: "bg-warning/10 text-warning-700 border-warning/20",
    destructive: "bg-destructive/10 text-destructive border-destructive/20",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4 grid grid-cols-[auto_1fr] items-center gap-3">
      <div className={cn("size-10 shrink-0 rounded-lg grid place-items-center border", toneClass)}><Icon className="size-4" /></div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold leading-tight truncate">{value}</div>
      </div>
    </div>
  );
}

// ── Kit components tab (item-mode) ──
function KitComponentsTab({ components }: { components: ItemData["kitComponents"] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">ของที่ประกอบเป็นชุดนี้ {components.length} รายการ — จำนวนต่อ 1 ชุด</p>
      <div className="rounded-xl border overflow-hidden bg-card">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-muted/40 [&>th]:h-8 [&>th]:py-0 [&>th]:text-xs [&>th]:text-muted-foreground">
              <TableHead className="w-28 md:w-32 px-2">รหัส</TableHead>
              <TableHead className="px-2">ชื่อ</TableHead>
              <TableHead className="w-28 md:w-32 px-2">คงเหลือ</TableHead>
              <TableHead className="w-24 md:w-28 text-right px-2">จำนวน/ชุด</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {components.map((c, i) => (
              <TableRow key={i} className="h-9 [&>td]:py-1">
                <TableCell className="font-mono text-xs text-muted-foreground px-2"><span className="block truncate">{c.componentItem?.code ?? "—"}</span></TableCell>
                <TableCell className="font-medium px-2"><span className="truncate min-w-0">{c.componentItem?.name ?? c.name}</span></TableCell>
                <TableCell className="text-muted-foreground px-2">{c.componentItem ? <span className={cn(c.componentItem.availableQty < c.quantity && "text-destructive font-medium")}>{c.componentItem.availableQty}</span> : "—"}</TableCell>
                <TableCell className="text-right tabular-nums px-2">{c.quantity} <span className="text-muted-foreground">{c.unit.name}</span></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
