import Link from "next/link";
import {
  ArrowDownToLine, ArrowUpFromLine, ChevronRight, TrendingUp, TrendingDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Only flow lives here. Everything actionable (low stock, repairs, overdue returns) is the
// alert bar's job, and every standing total (item count, pieces) is one tap away on /items —
// a card repeating them was a number nobody could act on. What is left is the one thing no
// other page computes: this month against last month.
type Tone = "success" | "info";

const TONE: Record<Tone, { chip: string; icon: string }> = {
  success: { chip: "bg-success/10", icon: "text-success" },
  info: { chip: "bg-info-500/10", icon: "text-info-500" },
};

export interface DashboardKpis {
  receiveThisMonth: number;
  receiveQtyThisMonth: number;
  receiveQtyLastMonth: number;
  dispenseThisMonth: number;
  dispenseQtyThisMonth: number;
  dispenseQtyLastMonth: number;
}

function trendOf(cur: number, prev: number): { up: boolean; pct: number } | null {
  if (prev <= 0) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return null;
  return { up: pct > 0, pct: Math.abs(pct) };
}

interface CardModel {
  label: string;
  Icon: typeof ArrowDownToLine;
  tone: Tone;
  value: number;
  unit: string;
  sub: string;
  trend: { up: boolean; pct: number } | null;
  href: string;
  cta: string;
}

// canManage=false is an EXECUTIVE: middleware blocks them from /receive and redirects back to
// "/", so that card would read as a dead button. It keeps the same numbers and lands on the
// report carrying the same rows instead.
export function DashboardKpiGrid({ kpis, canManage }: { kpis: DashboardKpis; canManage: boolean }) {
  const cards: CardModel[] = [
    {
      label: "รับเข้าเดือนนี้", Icon: ArrowDownToLine, tone: "success", value: kpis.receiveThisMonth, unit: "ครั้ง",
      sub: `${kpis.receiveQtyThisMonth.toLocaleString("th-TH")} ชิ้น`,
      trend: trendOf(kpis.receiveQtyThisMonth, kpis.receiveQtyLastMonth),
      href: canManage ? "/receive" : "/reports?tab=receive-history", cta: "ประวัติรับเข้า",
    },
    {
      label: "เบิกออกเดือนนี้", Icon: ArrowUpFromLine, tone: "info", value: kpis.dispenseThisMonth, unit: "ครั้ง",
      sub: `${kpis.dispenseQtyThisMonth.toLocaleString("th-TH")} ชิ้น`,
      trend: trendOf(kpis.dispenseQtyThisMonth, kpis.dispenseQtyLastMonth), href: "/dispense", cta: "ไปหน้าเบิก",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {cards.map((c) => {
        const tone = TONE[c.tone];
        return (
          <Link
            key={c.label}
            href={c.href}
            aria-label={`${c.label}: ${c.value.toLocaleString("th-TH")} ${c.unit}, ${c.sub} — ${c.cta}`}
            className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Card className="relative h-full gap-0 overflow-hidden py-0 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
              <CardContent className="flex h-full flex-col px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-xs font-medium text-muted-foreground">{c.label}</p>
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", tone.chip)}>
                    <c.Icon className={cn("size-4", tone.icon)} />
                  </span>
                </div>

                <p className={cn(
                  "mt-1.5 text-2xl font-bold tabular-nums",
                  c.value === 0 ? "text-muted-foreground" : "text-foreground",
                )}>
                  {c.value.toLocaleString("th-TH")}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">{c.unit}</span>
                </p>

                <div className="mt-1 flex min-h-[18px] items-center gap-2 text-[11px]">
                  <span className="truncate font-medium text-muted-foreground">{c.sub}</span>
                  {c.trend && (
                    <span className={cn("inline-flex shrink-0 items-center gap-0.5 font-semibold", c.trend.up ? "text-success" : "text-danger-500")}>
                      {c.trend.up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                      {c.trend.pct}%
                    </span>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between gap-1 pt-2.5 text-[11px] font-medium text-muted-foreground transition-colors group-hover:text-primary">
                  <span className="truncate">{c.cta}</span>
                  <ChevronRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
