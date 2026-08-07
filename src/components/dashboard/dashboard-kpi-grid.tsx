import Link from "next/link";
import {
  Package, ArrowDownToLine, ArrowUpFromLine, Handshake, Wrench, TriangleAlert,
  ChevronRight, TrendingUp, TrendingDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "info" | "warning" | "danger";
type Status = "neutral" | "ok" | "warn" | "critical";

const TONE: Record<Tone, { chip: string; icon: string }> = {
  neutral: { chip: "bg-muted", icon: "text-muted-foreground" },
  success: { chip: "bg-success/10", icon: "text-success" },
  info: { chip: "bg-info-500/10", icon: "text-info-500" },
  warning: { chip: "bg-warning/10", icon: "text-warning" },
  danger: { chip: "bg-danger-500/10", icon: "text-danger-500" },
};

const ACCENT: Record<Status, string> = {
  neutral: "bg-transparent",
  ok: "bg-success",
  warn: "bg-warning",
  critical: "bg-danger-500",
};

const SUB_TONE: Record<Status, string> = {
  neutral: "text-muted-foreground",
  ok: "text-success",
  warn: "text-warning-foreground",
  critical: "text-danger-500",
};

export interface DashboardKpis {
  totalItems: number;
  totalPieces: number;
  receiveThisMonth: number;
  receiveQtyThisMonth: number;
  receiveQtyLastMonth: number;
  dispenseThisMonth: number;
  dispenseQtyThisMonth: number;
  dispenseQtyLastMonth: number;
  onLoan: number;
  overdueReturn: number;
  dueTodayReturns: number;
  inRepair: number;
  damagedPending: number;
  lowStock: number;
  outOfStock: number;
}

function trendOf(cur: number, prev: number): { up: boolean; pct: number } | null {
  if (prev <= 0) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return null;
  return { up: pct > 0, pct: Math.abs(pct) };
}

interface CardModel {
  label: string;
  Icon: typeof Package;
  tone: Tone;
  value: number;
  unit: string;
  status: Status;
  sub: string;
  trend: { up: boolean; pct: number } | null;
  href: string;
  cta: string;
}

// canManage=false is an EXECUTIVE: middleware blocks them from /receive and /maintenance
// and redirects back to "/", so those two cards would read as dead buttons. They keep the
// same numbers and land on the report carrying the same rows instead.
export function DashboardKpiGrid({ kpis, canManage }: { kpis: DashboardKpis; canManage: boolean }) {
  const loanSub = kpis.overdueReturn > 0
    ? `เกินกำหนด ${kpis.overdueReturn}${kpis.dueTodayReturns > 0 ? ` · คืนวันนี้ ${kpis.dueTodayReturns}` : ""}`
    : kpis.dueTodayReturns > 0 ? `คืนวันนี้ ${kpis.dueTodayReturns}` : "ไม่มีเกินกำหนด";

  const lowSub = kpis.outOfStock > 0
    ? `หมดสต็อกแล้ว ${kpis.outOfStock}`
    : kpis.lowStock > 0 ? "ต่ำกว่าขั้นต่ำ" : "สต็อกปกติ";

  const cards: CardModel[] = [
    {
      label: "รายการทั้งหมด", Icon: Package, tone: "neutral", value: kpis.totalItems, unit: "รายการ",
      status: "neutral", sub: `${kpis.totalPieces.toLocaleString("th-TH")} ชิ้นรวม`, trend: null,
      href: "/items", cta: "ดูคลัง",
    },
    {
      label: "รับเข้าเดือนนี้", Icon: ArrowDownToLine, tone: "success", value: kpis.receiveThisMonth, unit: "ครั้ง",
      status: "neutral", sub: `${kpis.receiveQtyThisMonth.toLocaleString("th-TH")} ชิ้น`,
      trend: trendOf(kpis.receiveQtyThisMonth, kpis.receiveQtyLastMonth),
      href: canManage ? "/receive" : "/reports?tab=receive-history", cta: "ประวัติรับเข้า",
    },
    {
      label: "เบิกออกเดือนนี้", Icon: ArrowUpFromLine, tone: "info", value: kpis.dispenseThisMonth, unit: "ครั้ง",
      status: "neutral", sub: `${kpis.dispenseQtyThisMonth.toLocaleString("th-TH")} ชิ้น`,
      trend: trendOf(kpis.dispenseQtyThisMonth, kpis.dispenseQtyLastMonth), href: "/dispense", cta: "ไปหน้าเบิก",
    },
    {
      label: "กำลังยืม", Icon: Handshake, tone: "neutral", value: kpis.onLoan, unit: "รายการ",
      status: kpis.overdueReturn > 0 ? "critical" : kpis.dueTodayReturns > 0 ? "warn" : "ok",
      sub: loanSub, trend: null, href: "/items?onLoan=true", cta: "ติดตาม",
    },
    {
      label: "ส่งซ่อม", Icon: Wrench, tone: "warning", value: kpis.inRepair, unit: "งาน",
      status: kpis.damagedPending > 0 || kpis.inRepair > 0 ? "warn" : "ok",
      sub: kpis.damagedPending > 0 ? `รอส่งซ่อม ${kpis.damagedPending}` : "ไม่มีคิวรอ", trend: null,
      href: canManage ? "/maintenance" : "/reports?tab=damaged-assets",
      cta: canManage ? "ไปบำรุงรักษา" : "ดูครุภัณฑ์ชำรุด",
    },
    {
      label: "ใกล้หมด", Icon: TriangleAlert, tone: "danger", value: kpis.lowStock, unit: "รายการ",
      status: kpis.outOfStock > 0 ? "critical" : kpis.lowStock > 0 ? "warn" : "ok",
      sub: lowSub, trend: null, href: "/items?lowStock=true", cta: "ดูรายการ",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              <span className={cn("absolute inset-y-0 left-0 w-1", ACCENT[c.status])} />
              <CardContent className="flex h-full flex-col px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-xs font-medium text-muted-foreground">{c.label}</p>
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", tone.chip)}>
                    <c.Icon className={cn("size-4", tone.icon)} />
                  </span>
                </div>

                <p className={cn(
                  "mt-1.5 text-2xl font-bold tabular-nums",
                  c.value === 0 ? "text-muted-foreground" : c.status === "critical" ? "text-danger-500" : "text-foreground",
                )}>
                  {c.value.toLocaleString("th-TH")}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">{c.unit}</span>
                </p>

                <div className="mt-1 flex min-h-[18px] items-center gap-2 text-[11px]">
                  <span className={cn("truncate font-medium", SUB_TONE[c.status])}>{c.sub}</span>
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
