"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const maintStatus = useMemo(
    () => getMaintenanceStatus(item.nextMaintenanceDate),
    [item.nextMaintenanceDate],
  );

  return (
    <div className="space-y-4">
      {/* ── Card-light: Fixed Asset Info ── */}
      <section className="rounded-lg border divide-y">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">Fixed Asset Info</h3>
            <Badge variant={maintStatus.variant}>{maintStatus.label}</Badge>
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
            {item.model && (
              <div>
                <dt className="text-muted-foreground">Model</dt>
                <dd>{item.model}</dd>
              </div>
            )}
            {item.purchaseDate && (
              <div>
                <dt className="text-muted-foreground">Purchase</dt>
                <dd>{new Date(item.purchaseDate).toLocaleDateString("th-TH")}</dd>
              </div>
            )}
            {item.purchasePrice != null && (
              <div>
                <dt className="text-muted-foreground">Price</dt>
                <dd>฿{item.purchasePrice.toLocaleString()}</dd>
              </div>
            )}
            {item.vendorCompany && (
              <div>
                <dt className="text-muted-foreground">บริษัท</dt>
                <dd>{item.vendorCompany}</dd>
              </div>
            )}
            {item.vendorContact && (
              <div>
                <dt className="text-muted-foreground">ตัวแทน</dt>
                <dd>{item.vendorContact}</dd>
              </div>
            )}
            {item.vendorPhone && (
              <div>
                <dt className="text-muted-foreground">เบอร์โทร</dt>
                <dd>{item.vendorPhone}</dd>
              </div>
            )}
            {item.warrantyMonths > 0 && (
              <div>
                <dt className="text-muted-foreground">รับประกัน</dt>
                <dd>{item.warrantyMonths} เดือน</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Cycle</dt>
              <dd>{item.maintenanceCycleMonths} months</dd>
            </div>
            {item.lastMaintenanceDate && (
              <div>
                <dt className="text-muted-foreground">Last Maint</dt>
                <dd>{new Date(item.lastMaintenanceDate).toLocaleDateString("th-TH")}</dd>
              </div>
            )}
            {item.nextMaintenanceDate && (
              <div>
                <dt className="text-muted-foreground">Next Maint</dt>
                <dd>{new Date(item.nextMaintenanceDate).toLocaleDateString("th-TH")}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      {canAct && (
        <Button onClick={onRecordMaintenance}>
          <Wrench className="h-4 w-4 mr-1" />Record Maintenance
        </Button>
      )}

      {/* ── Maintenance History ── */}
      <div>
        <h4 className="text-sm font-medium mb-3">Maintenance History</h4>
        {maintenanceRecords.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-6">No maintenance records</p>
        ) : (
          <div className="space-y-2">
            {maintenanceRecords.map((rec, idx) => (
              <div
                key={rec.id}
                className={cn(
                  "p-3 rounded-lg border",
                  idx % 2 === 1 && "bg-muted/20",
                )}
              >
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
