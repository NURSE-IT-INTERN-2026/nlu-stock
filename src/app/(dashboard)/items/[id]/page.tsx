"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Info, Hash, Clock, Wrench,
  CheckCircle2, AlertTriangle, XCircle, ImageIcon,
} from "lucide-react";
import { useSession } from "@/components/layout/auth-guard";
import { usePageHeader } from "@/components/layout/page-header-context";
import { cn } from "@/lib/utils";
import { locationLabel } from "@/lib/constants";
import { getItem } from "@/lib/api";
import { ItemDetailOverview } from "@/components/items/item-detail-overview";
import { ItemDetailMedia } from "@/components/items/item-detail-media";
import { ItemDetailSubcodes } from "@/components/items/item-detail-subcodes";
import { ItemDetailHistory } from "@/components/items/item-detail-history";
import { ItemDetailMaintenance } from "@/components/items/item-detail-maintenance";
import { StockAdjustmentDialog } from "@/components/items/stock-adjustment-dialog";
import { ReportDamageDialog } from "@/components/items/report-damage-dialog";
import { MaintenanceFormDialog } from "@/components/items/maintenance-form-dialog";

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
  subUnit: { id: string; name: string };
  conversionFactor: number;
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
}

type TabKey = "overview" | "subcodes" | "history" | "maintenance" | "media";

export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useSession();
  const id = params.id as string;

  const [item, setItem] = useState<ItemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [damageOpen, setDamageOpen] = useState(false);
  const [maintOpen, setMaintOpen] = useState(false);
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

  const tabs: { key: TabKey; label: string; icon: typeof Info; show: boolean }[] = useMemo(() => [
    { key: "overview", label: "ข้อมูลทั่วไป", icon: Info, show: true },
    { key: "media", label: "รูปภาพ", icon: ImageIcon, show: !!(item?.imageUrl || (item?.images?.length ?? 0) > 0) || !!canAct },
    { key: "subcodes", label: `รหัสย่อย${item?.subItems.length ? ` (${item.subItems.length})` : ""}`, icon: Hash, show: !!(item?.trackIndividually && item.subItems.length > 1) },
    { key: "history", label: "ประวัติ", icon: Clock, show: true },
    { key: "maintenance", label: "การซ่อมบำรุง", icon: Wrench, show: true },
  ], [item?.trackIndividually, item?.subItems.length, item?.imageUrl, item?.images?.length, canAct]);

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
      <div className="max-w-5xl">
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
                <AlertTriangle className="size-5 text-warning shrink-0 mt-0.5" />
                <div className="text-sm min-w-0">
                  <span className="font-semibold text-warning">ใกล้หมดอายุ ({soonLots.length})</span>
                  <span className="text-muted-foreground ml-2">
                    {soonLots.map((l) => `Lot ${l.lotNumber} · ใน ${l.days} วัน`).join("  ·  ")}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Cover image + Title + Stock at-a-glance ── */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-8 pb-6 border-b border-border">
          {coverSrc && (
            <div className="relative w-full sm:w-64 aspect-[4/3] rounded-2xl overflow-hidden border border-border bg-muted shadow-sm shrink-0">
              <img src={coverSrc} alt={item.name} className="size-full object-cover" />
              <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wider font-semibold bg-background/90 px-2 py-0.5 rounded-full backdrop-blur-sm">
                Cover
              </span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <BadgePill label={item.category.profile?.name ?? item.category.name} />
              <span>·</span>
              <span className="font-mono">{item.code}</span>
              {/* Live status dot */}
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", stockStatus.color)} />
                <span>{stockStatus.label}</span>
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
              {item.name}
            </h1>
            {item.nameEn && <p className="text-sm text-muted-foreground mt-1">{item.nameEn}</p>}
            {item.description && <p className="mt-2 text-sm text-muted-foreground max-w-2xl">{item.description}</p>}
          </div>

          {/* Stock summary */}
          <StockSummary
            available={item.availableQty}
            total={item.totalQty}
            unit={item.issueUnit.name}
            minThreshold={item.minThreshold}
          />
        </div>

        {/* ── Tabs ── */}
        <div className="mt-6 flex items-center gap-1 border-b border-border">
          {tabs.filter((t) => t.show).map((t) => (
            <TabBtn key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} icon={t.icon}>
              {t.label}
            </TabBtn>
          ))}
        </div>

        {/* ── Tab content with fade ── */}
        <div className="mt-8 animate-in fade-in duration-200" key={tab}>
          {tab === "overview" && (
            <ItemDetailOverview
              item={item}
              userRole={user?.role || ""}
              onAdjust={() => setAdjustOpen(true)}
              onReportDamage={() => setDamageOpen(true)}
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
            <ItemDetailSubcodes subItems={item.subItems} itemId={item.id} canAct={!!canAct} onRefresh={fetchItem} />
          )}

          {tab === "history" && (
            <ItemDetailHistory itemId={item.id} />
          )}

          {tab === "maintenance" && (
            <ItemDetailMaintenance item={item} maintenanceRecords={item.maintenanceRecords} canAct={!!canAct} onRecordMaintenance={() => setMaintOpen(true)} />
          )}
        </div>
      </div>

      {/* ── Dialogs ── */}
      <StockAdjustmentDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        itemId={item.id}
        availableQty={item.availableQty}
        totalQty={item.totalQty}
        lots={item.lots?.map((l) => ({ id: l.id, lotNumber: l.lotNumber, remainingQty: l.remainingQty, expiryDate: l.expiryDate }))}
        checkedOutCount={item.trackIndividually
          ? item.subItems.filter(s => s.status === "CHECKED_OUT").length
          : item.totalQty - item.availableQty}
        onSuccess={fetchItem}
      />

      <ReportDamageDialog
        open={damageOpen}
        onOpenChange={setDamageOpen}
        itemId={item.id}
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
        "relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {children}
      {active && (
        <span className="absolute -bottom-px left-2 right-2 h-0.5 bg-primary rounded-full" />
      )}
    </button>
  );
}

function BadgePill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium bg-muted/50">
      {label}
    </span>
  );
}

function StockSummary({ available, total, unit, minThreshold }: {
  available: number; total: number; unit: string; minThreshold: number;
}) {
  const pct = total > 0 ? Math.round((available / total) * 100) : 0;
  const isLow = available < minThreshold;
  const isOut = available === 0;
  const gradientClass = isOut
    ? "from-destructive to-destructive/70"
    : isLow
      ? "from-warning to-warning/70"
      : "from-success to-success/70";

  const statusIcon = isOut
    ? <XCircle className="size-3 text-destructive" />
    : isLow
      ? <AlertTriangle className="size-3 text-warning" />
      : <CheckCircle2 className="size-3 text-success" />;

  const statusLabel = isOut ? "หมดสต็อก" : isLow ? "เหลือน้อย" : "มีในสต็อก";

  return (
    <div className="shrink-0 min-w-[220px]">
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-semibold tabular-nums">{available}</span>
        <span className="text-muted-foreground">/ {total} {unit}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5">
        {statusIcon}
        <span className={cn(
          "text-xs font-medium",
          isOut ? "text-destructive" : isLow ? "text-warning" : "text-success",
        )}>
          {statusLabel}
        </span>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", gradientClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>ระดับสต็อก</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}
