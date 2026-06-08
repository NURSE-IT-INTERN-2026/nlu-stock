"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Info, Hash, Clock, Wrench,
  CheckCircle2, AlertTriangle, XCircle,
} from "lucide-react";
import { useSession } from "@/components/layout/auth-guard";
import { cn } from "@/lib/utils";
import { Category, CATEGORY_LABELS } from "@/lib/constants";
import { getItem } from "@/lib/api";
import { ItemDetailOverview } from "@/components/items/item-detail-overview";
import { ItemDetailSubcodes } from "@/components/items/item-detail-subcodes";
import { ItemDetailHistory } from "@/components/items/item-detail-history";
import { ItemDetailMaintenance } from "@/components/items/item-detail-maintenance";
import { StockAdjustmentDialog } from "@/components/items/stock-adjustment-dialog";
import { ReportDamageDialog } from "@/components/items/report-damage-dialog";
import { MaintenanceFormDialog } from "@/components/items/maintenance-form-dialog";

interface CategoryType { id: string; name: string; category: string }
interface LocationType { id: string; building: string; floor: string; room: string; detail: string | null }
interface SubItemType { id: string; subCode: string; name: string | null; status: string; condition: string | null; serialNumber: string | null; notes: string | null }
interface LotType { id: string; lotNumber: string; expiryDate: string | null; quantity: number }

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

type TabKey = "overview" | "subcodes" | "history" | "maintenance";

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

  const isFixedAsset = useMemo(
    () => item?.category.category === "KRU" || item?.category.category === "ELE",
    [item?.category.category],
  );

  const canAct = useMemo(
    () => user?.role === "ADMIN" || user?.role === "STAFF",
    [user?.role],
  );

  const tabs: { key: TabKey; label: string; icon: typeof Info; show: boolean }[] = useMemo(() => [
    { key: "overview", label: "Overview", icon: Info, show: true },
    { key: "subcodes", label: `Sub-codes${item?.subItems.length ? ` (${item.subItems.length})` : ""}`, icon: Hash, show: !!(item?.trackIndividually && item.subItems.length > 1) },
    { key: "history", label: "History", icon: Clock, show: true },
    { key: "maintenance", label: "Maintenance", icon: Wrench, show: !!isFixedAsset },
  ], [item?.trackIndividually, item?.subItems.length, isFixedAsset]);

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
        <p className="text-muted-foreground font-medium">Item not found</p>
        <Button variant="outline" onClick={() => router.push("/items")}>
          <ArrowLeft className="h-4 w-4 mr-1" />Back to Items
        </Button>
      </div>
    );
  }

  // ── Live status indicator ──
  const stockStatus = item.minThreshold > 0
    ? item.availableQty < item.minThreshold
      ? { color: "bg-warning", label: "Low" }
      : { color: "bg-success", label: "OK" }
    : { color: "bg-success", label: "OK" };

  if (item.availableQty === 0) {
    stockStatus.color = "bg-destructive";
    stockStatus.label = "Out";
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Sticky top bar ── */}
      <header className="h-16 border-b border-border bg-background">
        <div className="h-full max-w-[1400px] mx-auto px-4 sm:px-6 flex items-center gap-3">
          <Link
            href="/items"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" /> All items
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-sm font-medium truncate font-mono">{item.code}</span>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        {/* ── Title + Stock at-a-glance ── */}
        <div className="flex flex-col lg:flex-row lg:items-end gap-6 lg:gap-10 pb-6 border-b border-border">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <BadgePill label={CATEGORY_LABELS[item.category.category as Category] ?? item.category.category} />
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

          {tab === "subcodes" && item.trackIndividually && item.subItems.length > 1 && (
            <ItemDetailSubcodes subItems={item.subItems} itemId={item.id} canAct={!!canAct} onRefresh={fetchItem} />
          )}

          {tab === "history" && (
            <ItemDetailHistory itemId={item.id} />
          )}

          {tab === "maintenance" && isFixedAsset && (
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

      {isFixedAsset && (
        <MaintenanceFormDialog
          open={maintOpen}
          onOpenChange={setMaintOpen}
          itemId={item.id}
          onSuccess={fetchItem}
        />
      )}
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

  const statusLabel = isOut ? "Out of stock" : isLow ? "Low stock" : "In stock";

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
        <span>Stock level</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}
