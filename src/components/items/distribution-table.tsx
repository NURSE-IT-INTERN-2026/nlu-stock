"use client";

import { MapPin, User2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate, TH_DAY } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface DistributionRow {
  kind: "location" | "borrower";
  label: string;
  qty: number;
  // Mirrors DistributionRow["state"] in lib/distribution.ts. Kept separate because the
  // server type carries Date and this one sees the JSON-serialised strings — add new
  // states to both.
  state: "AVAILABLE" | "IN_USE" | "ON_LOAN" | "DAMAGED";
  since?: string | null;
  dueAt?: string | null;
  unlocated?: boolean;
}

/**
 * Dot + plain text, not a filled badge. A bordered pill outweighs the plain text of the
 * place name beside it, which puts the loudest thing in the row on the secondary column and
 * leaves the eye unsure what to read first. The dot keeps the colour cue — you can still
 * find the ว่าง rows at a glance — at a fraction of the weight.
 *
 * Exported because the สต็อกคงเหลือ card directly above renders the same three numbers,
 * summed instead of per-row — it imports this rather than keeping a parallel copy, so the
 * card and the table cannot drift into calling one quantity two different things.
 */
export const STATE_META: Record<DistributionRow["state"], { label: string; dot: string }> = {
  AVAILABLE: { label: "ว่าง", dot: "bg-success" },
  IN_USE: { label: "ใช้งานอยู่", dot: "bg-chart-3" },
  ON_LOAN: { label: "ถูกยืม", dot: "bg-primary" },
  // Sitting in the storeroom but unusable — the reason the สถานะ column has to exist.
  DAMAGED: { label: "ชำรุด", dot: "bg-warning" },
};

export const distributionTotal = (rows: DistributionRow[]) => rows.reduce((sum, r) => sum + r.qty, 0);

/**
 * Replaces the single "สถานที่จัดเก็บ" line that used to sit among the spec rows. One line
 * could only ever name the item's registered room, which stops being true the moment any of
 * the stock is stationed elsewhere — and a COUNT item can have most of its stock sitting in
 * classrooms.
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
    return <p className="px-4 sm:px-5 py-4 text-sm text-muted-foreground">ไม่มีข้อมูลที่ตั้ง</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 [&>th]:h-9 [&>th]:py-0 [&>th]:text-xs [&>th]:text-muted-foreground">
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
              <TableRow key={`${r.kind}-${r.label}-${i}`}>
                <TableCell className="px-3">
                  {/* The subject of the row — carries the weight the badge used to steal. */}
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
