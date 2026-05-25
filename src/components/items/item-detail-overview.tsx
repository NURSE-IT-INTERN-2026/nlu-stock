"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect } from "react";
import { Package, QrCode, AlertTriangle, ShoppingCart, ArrowDownToLine, Flag, Undo2 } from "lucide-react";
import QRCode from "qrcode";

interface SubItemRecord {
  id: string;
  subCode: string;
  status: string;
}

interface CategoryType { id: string; name: string; category: string }
interface LocationType { id: string; room: string; cabinet: string | null; shelf: string | null }

interface ItemData {
  id: string;
  code: string;
  name: string;
  nameTh: string | null;
  category: CategoryType;
  trackIndividually: boolean;
  status: string;
  issueUnit: string;
  subUnit: string;
  conversionFactor: number;
  minThreshold: number;
  location: LocationType | null;
  imageUrl: string | null;
  description: string | null;
  availableQty: number;
  totalQty: number;
  subItems: SubItemRecord[];
}

const CATEGORY_LABELS: Record<string, string> = {
  CONSUMABLE: "สิ้นเปลือง",
  DURABLE: "คงทน",
  FIXED_ASSET: "ครุพันธุ์",
  BOOK: "หนังสือ",
};

interface Props {
  item: ItemData;
  userRole: string;
  onAdjust: () => void;
  onReportDamage: () => void;
  onRefresh: () => void;
}

export function ItemDetailOverview({ item, userRole, onAdjust, onReportDamage, onRefresh }: Props) {
  const canAct = userRole === "ADMIN" || userRole === "STAFF";
  const isLowStock = item.availableQty < item.minThreshold;
  const stockPercent = item.minThreshold > 0 ? Math.min(100, (item.availableQty / item.minThreshold) * 100) : 100;
  const checkedOutSubs = item.subItems.filter((s) => s.status === "CHECKED_OUT");

  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    QRCode.toDataURL(item.code, { width: 128, margin: 1 }).then(setQrDataUrl);
  }, [item.code]);

  const handleReturn = async (subItemId: string) => {
    const res = await fetch(`/api/items/${item.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subItemId }),
    });
    if (res.ok) onRefresh();
  };

  const handleReturnQty = async () => {
    const qty = prompt("Enter quantity to return:");
    if (!qty) return;
    const res = await fetch(`/api/items/${item.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: parseInt(qty) }),
    });
    if (res.ok) onRefresh();
  };

  const statusSummary = item.trackIndividually
    ? item.subItems.reduce((acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Item Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold">{item.code}</span>
              <Badge variant="outline">{CATEGORY_LABELS[item.category.category]}</Badge>
            </div>
            <p className="font-medium text-lg">{item.name}</p>
            {item.nameTh && <p className="text-muted-foreground">{item.nameTh}</p>}
            {item.description && <p className="text-sm text-muted-foreground mt-2">{item.description}</p>}
            <div className="text-sm space-y-1 mt-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Issue Unit</span>
                <span>{item.issueUnit}</span>
              </div>
              {item.subUnit && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sub Unit</span>
                  <span>{item.subUnit} (1 {item.issueUnit} = {item.conversionFactor} {item.subUnit})</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Location</span>
                <span>{item.location ? [item.location.room, item.location.cabinet, item.location.shelf].filter(Boolean).join(" / ") : "-"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Stock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold">{item.availableQty}</span>
              <span className="text-muted-foreground text-lg mb-1">/ {item.totalQty} {item.issueUnit}</span>
            </div>
            {isLowStock && (
              <div className="flex items-center gap-1 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>Below minimum threshold ({item.minThreshold})</span>
              </div>
            )}
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Stock level</span>
                <span>{item.minThreshold > 0 ? `${stockPercent.toFixed(0)}% of min` : "OK"}</span>
              </div>
              <Progress value={stockPercent} className="h-2" />
            </div>
            {statusSummary && (
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(statusSummary).map(([status, count]) => (
                  <Badge key={status} variant={status === "AVAILABLE" ? "default" : "secondary"}>
                    {status.replace(/_/g, " ")}: {count}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">QR Code</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`QR for ${item.code}`} className="w-32 h-32" />
          ) : (
            <div className="w-32 h-32 bg-muted animate-pulse rounded" />
          )}
          <div className="text-sm text-muted-foreground">
            <p>Scan to find item: <span className="font-mono font-medium">{item.code}</span></p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => window.print()}>
              <QrCode className="h-3.5 w-3.5 mr-1" />Print
            </Button>
          </div>
        </CardContent>
      </Card>

      {canAct && checkedOutSubs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Undo2 className="h-4 w-4" />Checked Out ({checkedOutSubs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {checkedOutSubs.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between rounded-md border p-2">
                  <span className="font-mono text-sm">{sub.subCode}</span>
                  <Button size="sm" variant="outline" onClick={() => handleReturn(sub.id)}>
                    <Undo2 className="h-3.5 w-3.5 mr-1" />Return
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {canAct && !item.trackIndividually && item.category.category !== "CONSUMABLE" && item.availableQty < item.totalQty && (
        <Button variant="outline" onClick={handleReturnQty}>
          <Undo2 className="h-4 w-4 mr-1" />Return Qty
        </Button>
      )}

      {canAct && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.location.href = `/dispense?item=${item.id}`}>
            <ShoppingCart className="h-4 w-4 mr-1" />Dispense
          </Button>
          <Button variant="outline" onClick={() => window.location.href = `/receive?item=${item.id}`}>
            <ArrowDownToLine className="h-4 w-4 mr-1" />Receive
          </Button>
          <Button variant="outline" onClick={onAdjust}>
            <Package className="h-4 w-4 mr-1" />Adjust Stock
          </Button>
          <Button variant="destructive" onClick={onReportDamage}>
            <Flag className="h-4 w-4 mr-1" />Report Damage/Lost
          </Button>
        </div>
      )}
    </div>
  );
}
