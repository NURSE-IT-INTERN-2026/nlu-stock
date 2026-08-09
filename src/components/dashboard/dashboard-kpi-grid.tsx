"use client";

import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, ChevronRight } from "lucide-react";
import { CountUp, Delta, Sparkline, FLOW, type FlowTone } from "./primitives";
import { cn } from "@/lib/utils";

// Only flow lives here. Everything actionable (low stock, repairs, overdue returns) is the
// alert bar's job, and every standing total (item count, pieces) is one tap away on /items —
// a card repeating them was a number nobody could act on. What is left is the one thing no
// other page computes: this month against last month.

export interface DashboardKpis {
  receiveThisMonth: number;
  receiveQtyThisMonth: number;
  receiveQtyLastMonth: number;
  /** Last 6 months of quantity, oldest first — current month is the last bucket. */
  receiveSpark: number[];
  dispenseThisMonth: number;
  dispenseQtyThisMonth: number;
  dispenseQtyLastMonth: number;
  dispenseSpark: number[];
}

function trendOf(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return pct === 0 ? null : pct;
}

interface CardModel {
  label: string;
  Icon: typeof ArrowDownToLine;
  tone: FlowTone;
  times: number;
  pieces: number;
  spark: number[];
  trend: number | null;
  foot: string;
  href: string;
  cta: string;
}

function KpiCard(c: CardModel) {
  const flow = FLOW[c.tone];
  return (
    <Link
      href={c.href}
      aria-label={`${c.label}: ${c.times.toLocaleString("th-TH")} ครั้ง, ${c.pieces.toLocaleString("th-TH")} ชิ้น — ${c.cta}`}
      className="animate-rise group flex flex-col rounded-2xl border bg-card p-4 shadow-lg shadow-black/[0.04] transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{c.label}</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <CountUp
              value={c.times}
              className={cn("text-3xl font-bold", c.times === 0 ? "text-muted-foreground" : flow.text)}
            />
            <span className="text-sm text-muted-foreground">ครั้ง</span>
          </div>
        </div>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", flow.soft)}>
          <c.Icon className={cn("size-4", flow.text)} />
        </span>
      </div>

      <div className="flex items-end gap-4">
        {/* The delta sits on ชิ้นรวม, not on ครั้ง — it is computed from quantity, and next to
            the headline it read as a month-over-month change in the number of transactions. */}
        <div className="shrink-0">
          <div className="flex items-baseline gap-1.5">
            <p className="text-2xl font-bold tabular-nums">{c.pieces.toLocaleString("th-TH")}</p>
            {c.trend !== null && <Delta value={c.trend} />}
          </div>
          <p className="text-[11px] text-muted-foreground">ชิ้นรวม</p>
        </div>
        <Sparkline data={c.spark} tone={c.tone} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3 text-[11px] text-muted-foreground">
        <span className="truncate">{c.foot}</span>
        <span className={cn("inline-flex shrink-0 items-center gap-0.5 font-semibold", flow.text)}>
          {c.cta}
          <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

// canManage=false is an EXECUTIVE: middleware blocks them from /receive and redirects back to
// "/", so that card would read as a dead button. It keeps the same numbers and lands on the
// report carrying the same rows instead.
export function DashboardKpiGrid({ kpis, canManage }: { kpis: DashboardKpis; canManage: boolean }) {
  const cards: CardModel[] = [
    {
      label: "รับเข้าเดือนนี้",
      Icon: ArrowDownToLine,
      tone: "received",
      times: kpis.receiveThisMonth,
      pieces: kpis.receiveQtyThisMonth,
      spark: kpis.receiveSpark,
      trend: trendOf(kpis.receiveQtyThisMonth, kpis.receiveQtyLastMonth),
      foot: `เดือนก่อน ${kpis.receiveQtyLastMonth.toLocaleString("th-TH")} ชิ้น`,
      href: canManage ? "/receive" : "/reports?tab=receive-history",
      cta: "ประวัติรับเข้า",
    },
    {
      label: "เบิกออกเดือนนี้",
      Icon: ArrowUpFromLine,
      tone: "issued",
      times: kpis.dispenseThisMonth,
      pieces: kpis.dispenseQtyThisMonth,
      spark: kpis.dispenseSpark,
      trend: trendOf(kpis.dispenseQtyThisMonth, kpis.dispenseQtyLastMonth),
      foot: `เดือนก่อน ${kpis.dispenseQtyLastMonth.toLocaleString("th-TH")} ชิ้น`,
      href: "/dispense",
      cta: "ไปหน้าเบิก",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cards.map((c) => (
        <KpiCard key={c.label} {...c} />
      ))}
    </div>
  );
}
