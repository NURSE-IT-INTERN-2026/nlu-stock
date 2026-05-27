"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wrench } from "lucide-react";

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

interface Props {
  item: {
    id: string;
    serialNumber: string | null;
    model: string | null;
    purchaseDate: string | null;
    purchasePrice: number | null;
    vendor: string | null;
    warrantyEndDate: string | null;
    maintenanceCycleMonths: number;
    lastMaintenanceDate: string | null;
    nextMaintenanceDate: string | null;
  };
  maintenanceRecords: MaintenanceRecord[];
  canAct: boolean;
  onRecordMaintenance: () => void;
}

function getMaintenanceStatus(nextDate: string | null): { label: string; variant: "default" | "secondary" | "destructive" } {
  if (!nextDate) return { label: "ไม่มีข้อมูล", variant: "secondary" };
  const now = new Date();
  const next = new Date(nextDate);
  const diffDays = (next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return { label: "เลยรอบ", variant: "destructive" };
  if (diffDays <= 30) return { label: "ใกล้ถึงรอบ", variant: "secondary" };
  return { label: "ปกติ", variant: "default" };
}

const RESULT_LABELS: Record<string, string> = {
  AVAILABLE: "พร้อมใช้งาน",
  NEEDS_MORE_REPAIR: "ต้องซ่อมเพิ่ม",
  DISPOSED: "จำหน่าย",
};

const TYPE_LABELS: Record<string, string> = {
  PREVENTIVE: "ป้องกัน",
  CORRECTIVE: "ซ่อมแก้ไข",
};

export function ItemDetailMaintenance({ item, maintenanceRecords, canAct, onRecordMaintenance }: Props) {
  const maintStatus = getMaintenanceStatus(item.nextMaintenanceDate);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fixed Asset Info</CardTitle>
            <Badge variant={maintStatus.variant}>{maintStatus.label}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {item.serialNumber && (
              <div><span className="text-muted-foreground">Serial:</span> <span className="font-mono">{item.serialNumber}</span></div>
            )}
            {item.model && (
              <div><span className="text-muted-foreground">Model:</span> {item.model}</div>
            )}
            {item.purchaseDate && (
              <div><span className="text-muted-foreground">Purchase:</span> {new Date(item.purchaseDate).toLocaleDateString("th-TH")}</div>
            )}
            {item.purchasePrice != null && (
              <div><span className="text-muted-foreground">Price:</span> ฿{item.purchasePrice.toLocaleString()}</div>
            )}
            {item.vendor && (
              <div><span className="text-muted-foreground">Vendor:</span> {item.vendor}</div>
            )}
            {item.warrantyEndDate && (
              <div><span className="text-muted-foreground">Warranty End:</span> {new Date(item.warrantyEndDate).toLocaleDateString("th-TH")}</div>
            )}
            <div><span className="text-muted-foreground">Cycle:</span> {item.maintenanceCycleMonths} months</div>
            {item.lastMaintenanceDate && (
              <div><span className="text-muted-foreground">Last Maint:</span> {new Date(item.lastMaintenanceDate).toLocaleDateString("th-TH")}</div>
            )}
            {item.nextMaintenanceDate && (
              <div><span className="text-muted-foreground">Next Maint:</span> {new Date(item.nextMaintenanceDate).toLocaleDateString("th-TH")}</div>
            )}
          </div>
        </CardContent>
      </Card>

      {canAct && (
        <Button onClick={onRecordMaintenance}>
          <Wrench className="h-4 w-4 mr-1" />Record Maintenance
        </Button>
      )}

      <div>
        <h4 className="text-sm font-medium mb-3">Maintenance History</h4>
        {maintenanceRecords.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-6">No maintenance records</p>
        ) : (
          <div className="space-y-2">
            {maintenanceRecords.map((rec) => (
              <div key={rec.id} className="p-3 rounded-lg border">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">{TYPE_LABELS[rec.type] || rec.type}</Badge>
                  <Badge variant={rec.result === "AVAILABLE" ? "default" : "secondary"} className="text-xs">
                    {RESULT_LABELS[rec.result] || rec.result}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(rec.performedAt).toLocaleDateString("th-TH")}
                  </span>
                </div>
                {rec.issue && <p className="text-sm font-medium">{rec.issue}</p>}
                {rec.description && <p className="text-sm text-muted-foreground">{rec.description}</p>}
                <div className="text-xs text-muted-foreground mt-1">
                  by {rec.performer.name}{rec.cost != null ? ` · ฿${rec.cost.toLocaleString()}` : ""}
                </div>
                {rec.attachmentUrls.length > 0 && (
                  <div className="flex gap-2 mt-1">
                    {rec.attachmentUrls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                        {url.endsWith(".pdf") ? `PDF ${i + 1}` : `Photo ${i + 1}`}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
