"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  DIALOG_SHELL, DIALOG_BODY,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, TH_DATE, TH_DATETIME } from "@/lib/format";
import { getReport } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ArrowDownToLine, Undo2 } from "lucide-react";
import type { DispenseEvent, StockOutRow } from "./stock-out-tab";

interface ReturnEntry {
  id: string;
  itemName: string;
  subCode: string | null;
  quantity: number;
  conditionLabel: string;
  condition: "AVAILABLE" | "DAMAGED" | "LOST";
  notes: string;
  returnerName: string;
  returnedAt: string;
}

const CONDITION_TONE: Record<ReturnEntry["condition"], string> = {
  AVAILABLE: "text-success-700 dark:text-success-200",
  DAMAGED: "text-warning-700 dark:text-warning-200",
  LOST: "text-destructive dark:text-danger-400",
};

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm break-words">{children}</p>
    </div>
  );
}

function ItemLines({ rows, showReturned }: { rows: StockOutRow[]; showReturned: boolean }) {
  return (
    <>
      {/* Desktop: table. Mobile: stacked lines — the same split ReportDataTable makes, done
          inline because this table is nested in a dialog and must not bring its own Card. */}
      <div className="hidden overflow-x-auto rounded-lg border sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>รหัสพัสดุ</TableHead>
              <TableHead>รายการพัสดุ</TableHead>
              <TableHead>Lot</TableHead>
              <TableHead className="text-right">จำนวน</TableHead>
              {showReturned && <TableHead className="text-right">คืนแล้ว</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.itemCode}</TableCell>
                <TableCell>{r.itemName}</TableCell>
                <TableCell className="text-muted-foreground">{r.lotNumber}</TableCell>
                <TableCell className="text-right tabular-nums">{r.quantity.toLocaleString()}</TableCell>
                {showReturned && (
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.resolvedQty} / {r.quantity}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="divide-y divide-border rounded-lg border sm:hidden">
        {rows.map((r) => (
          <div key={r.id} className="px-3 py-2">
            <p className="text-sm break-words">{r.itemName}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{r.itemCode}</span>
              {r.lotNumber !== "—" && ` · Lot ${r.lotNumber}`}
              {" · "}
              {r.quantity.toLocaleString()} หน่วย
              {showReturned && ` · คืนแล้ว ${r.resolvedQty}/${r.quantity}`}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}

export function DispenseEventDialog({
  event,
  headerLabel,
  status,
  showReturn,
  onClose,
}: {
  event: DispenseEvent | null;
  /** "เหตุผล" / "สถานที่" — the same thing the table calls the column that names the row. */
  headerLabel: string;
  status: ReactNode;
  showReturn: boolean;
  onClose: () => void;
}) {
  // Keyed by the event it belongs to rather than cleared on open: opening a second row would
  // otherwise show the previous row's returns for one frame before the reset landed.
  const [loaded, setLoaded] = useState<{ key: string; returns: ReturnEntry[] } | null>(null);
  const key = event?.key ?? null;
  const returns = loaded && loaded.key === key ? loaded.returns : null;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    getReport(`dispense-event/${key}`)
      .then((json) => {
        if (!cancelled) setLoaded({ key, returns: (json as { returns: ReturnEntry[] }).returns });
      })
      // The จ่ายออก line is built from the row already in hand, so a failed fetch costs the
      // return history and nothing else — an empty list beats an error wall over the items.
      .catch(() => {
        if (!cancelled) setLoaded({ key, returns: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (!event) return null;
  const { head, records, totalQty } = event;
  const title = showReturn ? head.recipient : (head.recipient ?? head.location);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[680px]">
        <div className={DIALOG_SHELL}>
          <DialogHeader className="shrink-0 border-b border-border bg-card px-5 py-4 pr-14">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-base font-semibold break-words">
                {title ?? `ไม่ระบุ${headerLabel}`}
              </DialogTitle>
              {status}
            </div>
            <DialogDescription className="text-xs">
              {headerLabel} · {fmtDate(new Date(head.dispensedAt), TH_DATETIME)}
            </DialogDescription>
          </DialogHeader>

          <div className={cn(DIALOG_BODY, "space-y-5 bg-secondary/40 px-5 py-5")}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Meta label="วันเวลา">{fmtDate(new Date(head.dispensedAt), TH_DATETIME)}</Meta>
              <Meta label="ดำเนินโดย">{head.staffName}</Meta>
              <Meta label="การใช้งาน">{head.usageTypeLabel}</Meta>
              {head.courseCode && (
                <Meta label="รายวิชา">
                  {head.courseCode}
                  {head.usageNote ? ` · ${head.usageNote}` : ""}
                </Meta>
              )}
              {head.location && <Meta label="สถานที่">{head.location}</Meta>}
              {showReturn && (
                <Meta label="กำหนดคืน">
                  {head.dueAt ? fmtDate(new Date(head.dueAt), TH_DATE) : "—"}
                </Meta>
              )}
              {/* เหตุผล of the older rows lives in notes and is already the dialog title
                  (lib/constants recipientLabel), so printing it again under หมายเหตุ says
                  the same sentence twice. Only a note that differs earns the line. */}
              {head.notes && head.notes !== title && (
                <div className="col-span-2 sm:col-span-3">
                  <Meta label="หมายเหตุ">{head.notes}</Meta>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                รายการพัสดุ · {records.length} รายการ · {totalQty.toLocaleString()} หน่วย
              </p>
              <ItemLines rows={records} showReturned={showReturn || !!head.location} />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">ประวัติ</p>
              <ol className="space-y-2.5">
                <li className="flex gap-2.5">
                  <ArrowDownToLine className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm">
                      จ่ายออก {totalQty.toLocaleString()} หน่วย
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(new Date(head.dispensedAt), TH_DATETIME)} · {head.staffName}
                    </p>
                  </div>
                </li>
                {returns === null ? (
                  <li className="pl-6 text-xs text-muted-foreground">กำลังโหลด…</li>
                ) : (
                  returns.map((r) => (
                    <li key={r.id} className="flex gap-2.5">
                      <Undo2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm break-words">
                          คืน {r.quantity.toLocaleString()} หน่วย{" "}
                          <span className={CONDITION_TONE[r.condition]}>({r.conditionLabel})</span>
                          {" · "}
                          {r.itemName}
                          {r.subCode ? ` (${r.subCode})` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground break-words">
                          {fmtDate(new Date(r.returnedAt), TH_DATETIME)} · {r.returnerName}
                          {r.notes ? ` · ${r.notes}` : ""}
                        </p>
                      </div>
                    </li>
                  ))
                )}
              </ol>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
