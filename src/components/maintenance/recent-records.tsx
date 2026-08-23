"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AttachmentList } from "@/components/shared/attachment-list";
import { cn } from "@/lib/utils";
import { fmtDate, TH_DATE } from "@/lib/format";
import { getReport } from "@/lib/api";
import { MAINT_RESULT_LABELS, labelFor, effectiveCode, type MaintenanceResult } from "@/lib/constants";

// ซ่อม ≠ บำรุงรักษา, and the two live on different pages now — but a finished job is written
// the same way whichever page filed it (one MaintenanceRecord, PREVENTIVE or CORRECTIVE), so
// both pages read it back through this one list instead of keeping a copy each.
export interface MaintenanceHistoryRow {
  id: string;
  itemCode: string;
  itemName: string;
  subCode: string | null;
  subCount: number;
  categoryName: string;
  type: string;
  result: string;
  issue: string;
  cost: number;
  attachmentUrls: string[];
  performer: string;
  performedAt: string;
}

export function RecentMaintenanceRecords({ type, title, empty, canEdit, limit = 5 }: {
  type: "PREVENTIVE" | "CORRECTIVE";
  title: string;
  empty: string;
  canEdit: boolean;
  limit?: number;
}) {
  const [records, setRecords] = useState<MaintenanceHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  // แนบเพิ่ม answers with the array as it now stands; the row shows that rather than the value
  // the last fetch happened to carry.
  const [edited, setEdited] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let alive = true;
    getReport("maintenance-history", { perPage: String(limit), maintenanceType: type })
      .then((d) => alive && setRecords(((d as { records?: MaintenanceHistoryRow[] }).records) ?? []))
      .catch(() => alive && toast.error("โหลดประวัติไม่สำเร็จ"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [type, limit]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{title}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{records.length} รายการล่าสุด</span>
        <Link href="/reports?tab=maintenance-history" className="ml-auto text-xs text-primary hover:underline">
          ดูทั้งหมดในรายงาน →
        </Link>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="space-y-2">
          {records.map((rec, idx) => (
            <div key={rec.id} className={cn("rounded-lg border bg-card p-3", idx % 2 === 1 && "bg-muted/20")}>
              <div className="mb-1 flex items-center gap-2">
                <Badge variant={rec.result === "AVAILABLE" ? "default" : "secondary"} className="text-xs">
                  {labelFor(MAINT_RESULT_LABELS, rec.result as MaintenanceResult)}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground">{fmtDate(rec.performedAt, TH_DATE)}</span>
              </div>
              <div className="text-sm">
                <span className="mr-2 font-mono text-xs text-muted-foreground">{effectiveCode(rec.itemCode, rec.subCode, rec.subCount)}</span>
                <span className="font-medium">{rec.itemName}</span>
              </div>
              {rec.issue && <p className="mt-0.5 text-sm text-muted-foreground">{rec.issue}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span>ผู้บันทึก {rec.performer}</span>
                <span>·</span>
                <span className="tabular-nums">{rec.cost > 0 ? `฿${rec.cost.toLocaleString()}` : "0.-"}</span>
              </div>
              <AttachmentList
                urls={edited[rec.id] ?? rec.attachmentUrls ?? []}
                className="mt-1.5"
                target={{ recordType: "MaintenanceRecord", recordId: rec.id }}
                canEdit={canEdit}
                onChange={(urls) => setEdited((m) => ({ ...m, [rec.id]: urls }))}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
