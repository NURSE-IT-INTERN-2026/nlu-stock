"use client";

import { MapPin, User2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/constants";
import { fmtDate, TH_DAY } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";

export interface DistributionRow {
  kind: "location" | "borrower";
  label: string;
  qty: number;
  // Mirrors DistributionRow["state"] in lib/distribution.ts. Kept separate because the
  // server type carries Date and this one sees the JSON-serialised strings — add new
  // states to both.
  state: "AVAILABLE" | "IN_USE" | "ON_LOAN" | "PENDING_MAINTENANCE" | "UNDER_REPAIR" | "DAMAGED";
  since?: string | null;
  dueAt?: string | null;
  unlocated?: boolean;
}

/**
 * Dot + plain text, not a filled badge. A bordered pill outweighs the plain text of the
 * place name beside it, which puts the loudest thing in the row on the secondary column and
 * leaves the eye unsure what to read first. The dot keeps the colour cue — you can still
 * find the พร้อมใช้งาน rows at a glance — at a fraction of the weight.
 *
 * Exported because the สต็อกคงเหลือ card directly above renders the same numbers, summed
 * instead of per-row — it imports this rather than keeping a parallel copy, so the card and
 * the table cannot drift into calling one quantity two different things.
 *
 * Words come from STATUS_LABELS, never from a literal here, so this table and the card above
 * cannot name the same DB value two different ways. Only the dot
 * stays local — STATUS_COLORS is hex for charts and STATUS_PILLS is a full pill, neither is
 * a bg-* dot class.
 */
export const STATE_META: Record<DistributionRow["state"], { label: string; dot: string }> = {
  AVAILABLE: { label: STATUS_LABELS.AVAILABLE, dot: "bg-success" },
  // Stock that is out doing its job — plus, by fallback, any status without a row of its
  // own (lib/distribution.ts SUB_ITEM_STATE). Never fold ส่งซ่อม in — this row would then
  // mean "not available, reason unstated".
  IN_USE: { label: STATUS_LABELS.IN_USE, dot: "bg-chart-3" },
  ON_LOAN: { label: STATUS_LABELS.ON_LOAN, dot: "bg-primary" },
  // ออกไปบำรุงข้างนอกแล้วยังไม่กลับ — คนละแถวกับส่งซ่อม เพราะของไม่ได้พัง แค่ไม่อยู่.
  PENDING_MAINTENANCE: { label: STATUS_LABELS.PENDING_MAINTENANCE, dot: "bg-sky-500" },
  UNDER_REPAIR: { label: STATUS_LABELS.UNDER_REPAIR, dot: "bg-chart-4" },
  // Sitting in the storeroom but unusable — the reason the สถานะ column has to exist.
  DAMAGED: { label: STATUS_LABELS.DAMAGED, dot: "bg-warning" },
};

export const distributionTotal = (rows: DistributionRow[]) => rows.reduce((sum, r) => sum + r.qty, 0);

/**
 * Every place the stock is, not just the registered room — a COUNT item can have most of its
 * stock sitting in classrooms.
 *
 * Every row is an equal citizen: the registered location is listed first for a stable order,
 * not marked as the real one. Which room counts as home is a decision staff make by reading
 * these numbers, so the table stays out of it.
 *
 * The สถานะ column is not decoration and must not be dropped to slim the table down: a
 * location no longer implies availability. Stock stationed in a classroom sits under a 📍
 * exactly like stock on the shelf, but only the shelf row can actually be drawn from — so
 * without the column, "how many can I take" invites summing every 📍 row and getting a
 * number two or three times too big.
 */
export function DistributionTable({ rows, unit }: { rows: DistributionRow[]; unit: string }) {
  if (rows.length === 0) {
    return <EmptyState title="ไม่มีข้อมูลที่ตั้ง" description="ระบุที่จัดเก็บให้พัสดุแล้วจะเห็นการกระจาย" />;
  }

  return (
    <div className="overflow-x-auto">
      <Table grid zebra>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="px-3">สถานที่</TableHead>
            {/* สถานะ qualifies the place; จำนวน closes the row on the right edge, where a
                column of numbers is easiest to compare down the page. */}
            <TableHead className="w-32 px-3">สถานะ</TableHead>
            <TableHead className="w-28 px-3 text-right">จำนวน</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const Icon = r.kind === "borrower" ? User2 : MapPin;
            return (
              // The subject cell grows a second line on some rows only; align-top stops
              // สถานะ/จำนวน from shifting down on exactly those rows.
              <TableRow key={`${r.kind}-${r.label}-${i}`} className="[&>td]:align-top">
                <TableCell className="px-3">
                  {/* The subject of the row — it carries the visual weight, not the badge. */}
                  <span className="flex items-center gap-1.5 min-w-0 font-medium">
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{r.label}</span>
                  </span>
                  {/* This stock is genuinely in use — only its room is missing, from records
                      written before นำไปใช้งาน required a real Location. Saying so keeps the
                      row from reading as a hole in the data. */}
                  {r.unlocated && (
                    <span className="block mt-0.5 pl-5 text-[11px] text-muted-foreground">
                      ข้อมูลเก่า ก่อนระบบบังคับระบุห้อง
                    </span>
                  )}
                  {r.since && (
                    <span className="block mt-0.5 pl-5 text-[11px] text-muted-foreground">
                      {fmtDate(r.since, TH_DAY)}
                      {r.dueAt && <> · ครบกำหนด {fmtDate(r.dueAt, TH_DAY)}</>}
                    </span>
                  )}
                </TableCell>
                {/* Usage state only. Overdue belongs to รายการยืมค้าง / แจ้งเตือน, which is
                    where someone goes to act on it — this table answers where things are,
                    and a red alert in the middle of it just pulls the eye off that. */}
                <TableCell className="px-3">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("size-1.5 rounded-full shrink-0", STATE_META[r.state].dot)} />
                    {STATE_META[r.state].label}
                  </span>
                </TableCell>
                <TableCell className="px-3 text-right tabular-nums whitespace-nowrap">
                  <span className="font-medium">{r.qty.toLocaleString("th-TH")}</span>
                  <span className="text-muted-foreground"> {unit}</span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
