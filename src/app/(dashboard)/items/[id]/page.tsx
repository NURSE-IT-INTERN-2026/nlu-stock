"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Info, Hash, Clock, Wrench, Boxes,
  CheckCircle2, AlertTriangle, XCircle, ImageIcon,
} from "lucide-react";
import { useSession } from "@/components/layout/auth-guard";
import { usePageHeader } from "@/components/layout/page-header-context";
import { cn } from "@/lib/utils";
import { locationLabel } from "@/lib/constants";
import { pic } from "@/lib/image";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getItem } from "@/lib/api";
import { ItemDetailOverview } from "@/components/items/item-detail-overview";
import { ItemDetailMedia } from "@/components/items/item-detail-media";
import { ItemDetailSubcodes } from "@/components/items/item-detail-subcodes";
import { ItemDetailHistory } from "@/components/items/item-detail-history";
import { ItemDetailMaintenance } from "@/components/items/item-detail-maintenance";
import { StockAdjustmentDialog } from "@/components/items/stock-adjustment-dialog";
import { ReportStatusDialog } from "@/components/items/report-status-dialog";
import { MaintenanceFormDialog } from "@/components/items/maintenance-form-dialog";
import { MoveLocationDialog } from "@/components/items/move-location-dialog";
import { EditItemDialog } from "@/components/shared/edit-item-dialog";

interface CategoryType { id: string; name: string; profile: { name: string; dispenseType: "CONSUMABLE" | "COUNT" | "ITEM" } | null }
interface LocationType { id: string; building: string; floor: string; room: string; detail: string | null }
interface SubItemType { id: string; subCode: string; name: string | null; status: string; condition: string | null; serialNumber: string | null; notes: string | null }
interface LotType { id: string; lotNumber: string; expiryDate: string | null; receivedQty: number; remainingQty: number }

interface ItemData {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  category: CategoryType;
  trackIndividually: boolean;
  status: string;
  issueUnit: { id: string; name: string };
  minThreshold: number;
  location: LocationType | null;
  imageUrl: string | null;
  description: string | null;
  images: string[];
  availableQty: number;
  totalQty: number;
  subItems: SubItemType[];
  lots: LotType[];
  model: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  vendorCompany: string | null;
  vendorContact: string | null;
  vendorPhone: string | null;
  warrantyMonths: number;
  maintenanceCycleMonths: number;
  lastMaintenanceDate: string | null;
  nextMaintenanceDate: string | null;
  storageRequirements: string | null;
  dispenseRecords: unknown[];
  receiveRecords: unknown[];
  maintenanceRecords: { id: string; type: string; result: string; performedAt: string; issue: string | null; description: string | null; cost: number | null; performer: { name: string }; attachmentUrls: string[] }[];
  statusLogs: unknown[];
  adjustments: unknown[];
  kitComponents: {
    quantity: number;
    name: string;
    componentItem: { code: string; name: string; availableQty: number } | null;
    unit: { name: string };
  }[];
}

type TabKey = "overview" | "subcodes" | "history" | "maintenance" | "media" | "kit";

// ── Stock usage breakdown (segmented bar + legend) ──
const STOCK_STATUS_ORDER = [
  "AVAILABLE", "ON_LOAN", "IN_USE", "PENDING_MAINTENANCE", "UNDER_REPAIR", "DAMAGED", "LOST", "DISPOSED",
];
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

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useSession();
  const id = params.id as string;

  const [item, setItem] = useState<ItemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustFixedReason, setAdjustFixedReason] = useState<string | null>(null);
  const [statusAction, setStatusAction] = useState<"DAMAGED" | "LOST" | "DISPOSED" | null>(null);
  const [maintOpen, setMaintOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");

  const fetchItem = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getItem(id);
      setItem(data as ItemData);
    } catch {}
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchItem(); }, [fetchItem]);

  // Push item code up to the layout Header breadcrumb
  const { setDetail } = usePageHeader();
  useEffect(() => {
    setDetail(item?.code ?? null);
    return () => setDetail(null);
  }, [item?.code, setDetail]);

  const canAct = useMemo(
    () => user?.role === "ADMIN" || user?.role === "STAFF",
    [user?.role],
  );

  const tabs: { key: TabKey; label: string; icon: typeof Info; show: boolean }[] = [
    { key: "overview", label: "ข้อมูลทั่วไป", icon: Info, show: true },
    { key: "media", label: "รูปภาพ", icon: ImageIcon, show: !!(item?.imageUrl || (item?.images?.length ?? 0) > 0) || !!canAct },
    { key: "subcodes", label: `รหัสย่อย${item?.subItems.length ? ` (${item.subItems.length})` : ""}`, icon: Hash, show: !!(item?.trackIndividually && item.subItems.length > 1) },
    { key: "history", label: "ประวัติ", icon: Clock, show: true },
    { key: "maintenance", label: "การซ่อมบำรุง", icon: Wrench, show: true },
    { key: "kit", label: `ชุดประกอบ${item?.kitComponents?.length ? ` (${item.kitComponents.length})` : ""}`, icon: Boxes, show: !!(item?.kitComponents?.length) },
  ];

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 animate-in fade-in duration-300">
        <div className="grid place-items-center size-16 rounded-2xl bg-muted text-muted-foreground">
          <XCircle className="size-8" />
        </div>
        <p className="text-muted-foreground font-medium">ไม่พบพัสดุ</p>
        <Button variant="outline" onClick={() => router.push("/items")}>
          <ArrowLeft className="h-4 w-4 mr-1" />กลับสู่รายการพัสดุ
        </Button>
      </div>
    );
  }

  // ── Live status indicator ──
  const stockStatus = item.minThreshold > 0
    ? item.availableQty < item.minThreshold
      ? { color: "bg-warning", label: "ต่ำ" }
      : { color: "bg-success", label: "ปกติ" }
    : { color: "bg-success", label: "ปกติ" };

  if (item.availableQty === 0) {
    stockStatus.color = "bg-destructive";
    stockStatus.label = "หมด";
  }

  const coverSrc = item.imageUrl ?? item.images?.[0] ?? null;

  // ── Lot expiry alert ──
  const now = new Date();
  const expiredLots: { lotNumber: string; expiryDate: string }[] = [];
  const soonLots: { lotNumber: string; days: number }[] = [];
  for (const l of item.lots ?? []) {
    if (!l.expiryDate) continue;
    const days = Math.floor((new Date(l.expiryDate).getTime() - now.getTime()) / 86_400_000);
    if (days < 0) expiredLots.push({ lotNumber: l.lotNumber, expiryDate: l.expiryDate });
    else if (days <= 60) soonLots.push({ lotNumber: l.lotNumber, days });
  }
  const hasExpiryAlert = expiredLots.length > 0 || soonLots.length > 0;

  return (
    <div>
      <div className="max-w-6xl">
        {/* ── Expiry alert ── */}
        {hasExpiryAlert && (
          <div className="mb-6 space-y-2">
            {expiredLots.length > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
                <XCircle className="size-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm min-w-0">
                  <span className="font-semibold text-destructive">หมดอายุแล้ว ({expiredLots.length})</span>
                  <span className="text-muted-foreground ml-2">
                    {expiredLots.map((l) => `Lot ${l.lotNumber} · ${new Date(l.expiryDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}`).join("  ·  ")}
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
                    {soonLots.map((l) => `Lot ${l.lotNumber} · ใน ${l.days} วัน`).join("  ·  ")}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Hero card: Cover + Title + Stock + Tabs ── */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="grid gap-5 sm:gap-6 lg:gap-8 p-4 sm:p-6 grid-cols-1 md:grid-cols-[auto_1fr] xl:grid-cols-[auto_1fr_auto]">
            {/* Cover */}
            <div className="relative w-full md:w-48 lg:w-56 aspect-square rounded-xl overflow-hidden ring-1 ring-border bg-muted shadow-sm">
              <img src={coverSrc ?? pic(item.code, 640, 480)} alt={item.name} className="size-full object-cover" />
              <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wider font-semibold bg-background/90 px-2 py-0.5 rounded-full backdrop-blur-sm">
                Cover
              </span>
            </div>

            {/* Title block */}
            <div className="flex flex-col justify-between min-w-0 py-1">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs mb-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium border border-primary/20">
                    {item.category.profile?.name ?? item.category.name}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-mono text-muted-foreground">{item.code}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("size-1.5 rounded-full", stockStatus.color)} />
                    <span className="text-muted-foreground">{stockStatus.label}</span>
                  </span>
                </div>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold leading-none tracking-tight text-balance break-words">
                  {item.name}
                </h1>
                {item.nameEn && <p className="text-muted-foreground mt-2 text-sm italic">{item.nameEn}</p>}
                {item.description && <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{item.description}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-4">
                <span className="text-xs px-2.5 py-1 rounded-md bg-muted border border-border text-muted-foreground">
                  หน่วย <span className="text-foreground font-medium">{item.issueUnit.name}</span>
                </span>
                {item.location && (
                  <span className="text-xs px-2.5 py-1 rounded-md bg-muted border border-border text-muted-foreground">
                    {locationLabel(item.location)}
                  </span>
                )}
              </div>
            </div>

            {/* Stock summary */}
            <StockSummary
              available={item.availableQty}
              total={item.totalQty}
              unit={item.issueUnit.name}
              minThreshold={item.minThreshold}
              trackIndividually={item.trackIndividually}
              subItems={item.subItems}
            />
          </div>

          {/* ── Tabs ── */}
          <div className="border-t border-border px-2 sm:px-6 flex items-center gap-1 bg-muted/30 overflow-x-auto">
            {tabs.filter((t) => t.show).map((t) => (
              <TabBtn key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} icon={t.icon}>
                {t.label}
              </TabBtn>
            ))}
          </div>
        </section>

        {/* ── Tab content with fade ── */}
        <div className="mt-5 animate-in fade-in duration-200" key={tab}>
          {tab === "overview" && (
            <ItemDetailOverview
              item={item}
              userRole={user?.role || ""}
              onAdjust={() => setAdjustOpen(true)}
              onReportDamage={() => {
                // Tracked (per-piece) asset → set the unit's status DAMAGED.
                // Qty-based consumable → damage is a qty deduction with reason DAMAGED (keeps item AVAILABLE).
                if (item.trackIndividually) setStatusAction("DAMAGED");
                else { setAdjustFixedReason("DAMAGED_PENDING_REPAIR"); setAdjustOpen(true); }
              }}
              onReportStatus={(s) => setStatusAction(s)}
              onMoveLocation={() => setMoveOpen(true)}
              onEdit={() => setEditOpen(true)}
              onRefresh={fetchItem}
            />
          )}

          {tab === "media" && (
            <ItemDetailMedia
              item={{ id: item.id, imageUrl: item.imageUrl, images: item.images }}
              canAct={!!canAct}
              onRefresh={fetchItem}
            />
          )}

          {tab === "subcodes" && item.trackIndividually && item.subItems.length > 1 && (
            <ItemDetailSubcodes subItems={item.subItems} itemId={item.id} itemCode={item.code} canAct={!!canAct} onRefresh={fetchItem} />
          )}

          {tab === "history" && (
            <ItemDetailHistory itemId={item.id} />
          )}

          {tab === "maintenance" && (
            <ItemDetailMaintenance item={item} maintenanceRecords={item.maintenanceRecords} canAct={!!canAct} onRecordMaintenance={() => setMaintOpen(true)} />
          )}

          {tab === "kit" && item.kitComponents.length > 0 && (
            <KitComponentsTab components={item.kitComponents} />
          )}
        </div>
      </div>

      {/* ── Dialogs ── */}
      <StockAdjustmentDialog
        open={adjustOpen}
        onOpenChange={(o) => { setAdjustOpen(o); if (!o) setAdjustFixedReason(null); }}
        fixedReason={adjustFixedReason ?? undefined}
        itemId={item.id}
        itemCode={item.code}
        availableQty={item.availableQty}
        totalQty={item.totalQty}
        lots={item.lots?.map((l) => ({ id: l.id, lotNumber: l.lotNumber, remainingQty: l.remainingQty, expiryDate: l.expiryDate }))}
        trackIndividually={item.trackIndividually}
        subItems={item.subItems?.map((s) => ({ id: s.id, subCode: s.subCode, name: s.name, status: s.status }))}
        checkedOutCount={item.trackIndividually
          ? item.subItems.filter(s => s.status === "ON_LOAN").length
          : item.totalQty - item.availableQty}
        onSuccess={fetchItem}
      />

      <ReportStatusDialog
        open={statusAction !== null}
        onOpenChange={(o) => { if (!o) setStatusAction(null); }}
        itemId={item.id}
        itemCode={item.code}
        status={statusAction ?? "DAMAGED"}
        trackIndividually={item.trackIndividually}
        subItems={item.subItems}
        onSuccess={fetchItem}
      />

      <MaintenanceFormDialog
        open={maintOpen}
        onOpenChange={setMaintOpen}
        itemId={item.id}
        maintenanceCycleMonths={item.maintenanceCycleMonths}
        onSuccess={fetchItem}
      />

      <MoveLocationDialog
        key={moveOpen ? "open" : "closed"}
        open={moveOpen}
        onOpenChange={setMoveOpen}
        items={[{ id: item.id, code: item.code, name: item.name }]}
        currentLocationId={item.location?.id ?? null}
        onSuccess={fetchItem}
      />

      <EditItemDialog
        open={editOpen}
        itemId={item.id}
        onOpenChange={setEditOpen}
        onSaved={fetchItem}
      />
    </div>
  );
}

// ── Sub-components ──

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
          layoutId="item-detail-tab"
          transition={{ type: "spring", stiffness: 450, damping: 35 }}
          className="absolute inset-x-3 -bottom-px h-0.5 bg-primary rounded-full"
        />
      )}
    </button>
  );
}

function StockSummary({ available, total, unit, minThreshold, trackIndividually, subItems }: {
  available: number; total: number; unit: string; minThreshold: number;
  trackIndividually: boolean; subItems: { status: string }[];
}) {
  const isLow = available < minThreshold;
  const isOut = available === 0;

  const statusIcon = isOut
    ? <XCircle className="size-4 text-destructive" />
    : isLow
      ? <AlertTriangle className="size-4 text-warning-700" />
      : <CheckCircle2 className="size-4 text-success-700" />;

  const statusLabel = isOut ? "หมดสต็อก" : isLow ? "เหลือน้อย" : "มีในสต็อก";

  // ── Usage breakdown segments ──
  const segments: { key: string; label: string; bar: string; dot: string; count: number }[] = [];
  if (trackIndividually && subItems.length > 0) {
    const counts: Record<string, number> = {};
    for (const s of subItems) counts[s.status] = (counts[s.status] ?? 0) + 1;
    for (const key of STOCK_STATUS_ORDER) {
      if (counts[key]) segments.push({ key, ...STOCK_STATUS_META[key], count: counts[key] });
    }
    for (const [key, count] of Object.entries(counts)) {
      if (!STOCK_STATUS_ORDER.includes(key)) {
        segments.push({ key, label: key.replace(/_/g, " "), bar: "bg-muted-foreground", dot: "bg-muted-foreground", count });
      }
    }
  } else {
    const used = Math.max(0, total - available);
    if (available > 0) segments.push({ key: "AVAILABLE", ...STOCK_STATUS_META.AVAILABLE, count: available });
    if (used > 0) segments.push({ key: "USED", label: "ถูกเบิก/ใช้งาน", bar: "bg-primary", dot: "bg-primary", count: used });
  }

  const usedPct = total > 0 ? Math.round(((total - available) / total) * 100) : 0;

  return (
    <div className="w-full xl:w-72 rounded-xl bg-gradient-to-br from-muted/50 to-card border border-border p-5 md:col-span-2 xl:col-span-1">
      <div className="flex items-baseline gap-1">
        <span className="text-5xl sm:text-6xl font-semibold leading-none tabular-nums">{available}</span>
        <span className="text-sm text-muted-foreground">/ {total} {unit}</span>
      </div>
      <div className={cn(
        "mt-3 inline-flex items-center gap-1.5 text-sm font-medium",
        isOut ? "text-destructive" : isLow ? "text-warning-700" : "text-success-700",
      )}>
        {statusIcon}
        {statusLabel}
      </div>

      {/* Usage breakdown */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-muted-foreground">สัดส่วนการใช้งาน</span>
          <span className="text-muted-foreground">
            ใช้ไป <span className="font-semibold text-foreground tabular-nums">{usedPct}%</span>
          </span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
          {segments.map((s) => (
            <div
              key={s.key}
              className={cn("h-full", s.bar)}
              style={{ width: `${total > 0 ? (s.count / total) * 100 : 0}%` }}
              title={`${s.label}: ${s.count}`}
            />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {segments.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 text-xs min-w-0">
              <span className={cn("size-2 rounded-full shrink-0", s.dot)} />
              <span className="text-muted-foreground truncate">{s.label}</span>
              <span className="ml-auto font-semibold tabular-nums">{s.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KitComponentsTab({ components }: {
  components: ItemData["kitComponents"];
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        ของที่ประกอบเป็นชุดนี้ {components.length} รายการ — จำนวนต่อ 1 ชุด
      </p>
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
                <TableCell className="font-mono text-xs text-muted-foreground px-2">
                  <span className="block truncate">{c.componentItem?.code ?? "—"}</span>
                </TableCell>
                <TableCell className="font-medium px-2"><span className="truncate min-w-0">{c.componentItem?.name ?? c.name}</span></TableCell>
                <TableCell className="text-muted-foreground px-2">
                  {c.componentItem ? (
                    <span className={cn(c.componentItem.availableQty < c.quantity && "text-destructive font-medium")}>
                      {c.componentItem.availableQty}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums px-2">
                  {c.quantity} <span className="text-muted-foreground">{c.unit.name}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
