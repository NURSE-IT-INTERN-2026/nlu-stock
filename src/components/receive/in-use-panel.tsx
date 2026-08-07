"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, MapPin, RotateCcw, Search, CalendarClock } from "lucide-react";
import { locationLabel, formatSubCode } from "@/lib/constants";
import { fmtDate, TH_DAY } from "@/lib/format";
import { ItemThumb } from "@/components/shared/item-thumb";
import { getInUseRecords, type InUseRecord } from "@/lib/api";
import { ReturnToStoreDialog } from "@/components/receive/return-to-store-dialog";

/**
 * The คืนเข้าคลัง tab: everything currently นำไปใช้งาน, whatever its dispense type.
 *
 * Replaces SubItemStatusPanel(status="IN_USE") here, which read the sub_items table and so
 * could only ever list tracked pieces — วัสดุคงทน (COUNT) has no per-unit row, so its
 * stationed stock was invisible on this tab and showed up on รับคืนจากใบยืม instead, mixed
 * in with things people actually owe back. Open INUSE DispenseRecords cover both kinds.
 *
 * One card per record, not per room: two batches sent to the same room on different days
 * stay apart so ของค้างนาน is visible, and a return resolves one record's quantity anyway.
 */
export function InUsePanel() {
  const [rows, setRows] = useState<InUseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInUseRecords();
      setRows(data.records);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <RotateCcw className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">ไม่มีรายการที่อยู่ระหว่างนำไปใช้งาน</p>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        r.item.name.toLowerCase().includes(q) ||
        r.item.code.toLowerCase().includes(q) ||
        (r.subItem?.subCode.toLowerCase().includes(q) ?? false) ||
        (r.location ? locationLabel(r.location).toLowerCase().includes(q) : false))
    : rows;

  const totalOut = filtered.reduce((sum, r) => sum + (r.quantity - r.resolvedQty), 0);

  return (
    <Card className="flex flex-col max-h-full min-h-0 overflow-hidden">
      <CardContent className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="shrink-0 space-y-2 sm:space-y-3">
          <p className="text-xs text-muted-foreground">
            {filtered.length} รายการ · {totalOut.toLocaleString("th-TH")} หน่วยอยู่นอกคลัง
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาชื่อพัสดุ / รหัส / สถานที่…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-9 text-sm"
            />
          </div>
          <Separator />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pb-2">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">ไม่พบ &ldquo;{query}&rdquo;</p>
          ) : (
            filtered.map((r) => <InUseRow key={r.id} row={r} onResolved={load} />)
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InUseRow({ row, onResolved }: { row: InUseRecord; onResolved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const outstanding = row.quantity - row.resolvedQty;
  // Legacy rows written before นำไปใช้งาน required a real Location have none — say so
  // plainly rather than borrowing the item's registered room and implying it's still there.
  const where = row.location ? locationLabel(row.location) : "ไม่ระบุที่ตั้ง";
  const code = row.subItem
    ? formatSubCode(row.item.code, row.subItem.subCode)
    : row.item.code;

  return (
    <Card className="border shadow-none py-2.5">
      <CardContent>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-muted flex items-center justify-center">
              <ItemThumb src={row.item.imageUrl} alt={row.item.name} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm leading-snug">{row.item.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{code}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                <span className="inline-flex items-center gap-1"><MapPin className="size-3 text-primary/80" />{where}</span>
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3" />ตั้งแต่ {fmtDate(row.dispensedAt, TH_DAY)}
                </span>
                {/* Only worth a line when it isn't the whole record — a partly-collected
                    batch is the case where "how many are still out there" isn't obvious. */}
                {row.resolvedQty > 0 && (
                  <span>คืนแล้ว <span className="text-foreground">{row.resolvedQty}/{row.quantity}</span></span>
                )}
                {row.notes && <span>หมายเหตุ: <span className="text-foreground">{row.notes}</span></span>}
              </div>
            </div>
          </div>
          <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:justify-end">
            {!row.subItem && (
              <span className="text-sm tabular-nums">
                <span className="font-semibold">{outstanding.toLocaleString("th-TH")}</span>
                <span className="text-muted-foreground"> {row.item.issueUnit.name}</span>
              </span>
            )}
            <Button size="sm" className="h-9" disabled={saving} onClick={() => setOpen(true)}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
              คืนเข้าคลัง
            </Button>
          </div>
        </div>
      </CardContent>

      <ReturnToStoreDialog
        open={open}
        onOpenChange={setOpen}
        record={row}
        onSaving={setSaving}
        onSuccess={onResolved}
      />
    </Card>
  );
}
