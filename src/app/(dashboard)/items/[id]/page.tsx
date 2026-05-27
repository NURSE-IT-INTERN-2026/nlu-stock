"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Info, Hash, Clock, Wrench } from "lucide-react";
import { useSession } from "@/components/layout/auth-guard";
import { ItemDetailOverview } from "@/components/items/item-detail-overview";
import { ItemDetailSubcodes } from "@/components/items/item-detail-subcodes";
import { ItemDetailHistory } from "@/components/items/item-detail-history";
import { ItemDetailMaintenance } from "@/components/items/item-detail-maintenance";
import { StockAdjustmentDialog } from "@/components/items/stock-adjustment-dialog";
import { ReportDamageDialog } from "@/components/items/report-damage-dialog";
import { MaintenanceFormDialog } from "@/components/items/maintenance-form-dialog";

interface CategoryType { id: string; name: string; category: string }
interface LocationType { id: string; room: string; cabinet: string | null; shelf: string | null }
interface SubItemType { id: string; subCode: string; status: string; condition: string | null; notes: string | null }
interface LotType { id: string; lotNumber: string; expiryDate: string | null; quantity: number }

interface ItemData {
  id: string;
  code: string;
  name: string;
  nameTh: string | null;
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
  availableQty: number;
  totalQty: number;
  subItems: SubItemType[];
  lots: LotType[];
  serialNumber: string | null;
  model: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  vendor: string | null;
  warrantyEndDate: string | null;
  maintenanceCycleMonths: number;
  lastMaintenanceDate: string | null;
  nextMaintenanceDate: string | null;
  dispenseRecords: unknown[];
  receiveRecords: unknown[];
  maintenanceRecords: { id: string; type: string; result: string; performedAt: string; issue: string | null; description: string | null; cost: number | null; performer: { name: string }; attachmentUrls: string[] }[];
  statusLogs: unknown[];
  adjustments: unknown[];
}

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

  const fetchItem = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/items/${id}`);
    if (res.ok) {
      setItem(await res.json());
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchItem(); }, [fetchItem]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Item not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/items")}>
          <ArrowLeft className="h-4 w-4 mr-1" />Back to Items
        </Button>
      </div>
    );
  }

  const isFixedAsset = item.category.category === "FIXED_ASSET";
  const canAct = user?.role === "ADMIN" || user?.role === "STAFF";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push("/items")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">{item.name}</h2>
          <p className="text-sm text-muted-foreground font-mono">{item.code}</p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <Info className="h-3.5 w-3.5" />Overview
          </TabsTrigger>
          {item.trackIndividually && (
            <TabsTrigger value="subcodes" className="gap-1.5">
              <Hash className="h-3.5 w-3.5" />Sub-codes ({item.subItems.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="history" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />History
          </TabsTrigger>
          {isFixedAsset && (
            <TabsTrigger value="maintenance" className="gap-1.5">
              <Wrench className="h-3.5 w-3.5" />Maintenance
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <ItemDetailOverview
            item={item}
            userRole={user?.role || ""}
            onAdjust={() => setAdjustOpen(true)}
            onReportDamage={() => setDamageOpen(true)}
            onRefresh={fetchItem}
          />
        </TabsContent>

        {item.trackIndividually && (
          <TabsContent value="subcodes" className="mt-4">
            <ItemDetailSubcodes subItems={item.subItems} itemId={item.id} canAct={canAct} onRefresh={fetchItem} />
          </TabsContent>
        )}

        <TabsContent value="history" className="mt-4">
          <ItemDetailHistory itemId={item.id} />
        </TabsContent>

        {isFixedAsset && (
          <TabsContent value="maintenance" className="mt-4">
            <ItemDetailMaintenance item={item} maintenanceRecords={item.maintenanceRecords} canAct={canAct} onRecordMaintenance={() => setMaintOpen(true)} />
          </TabsContent>
        )}
      </Tabs>

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
