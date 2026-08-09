import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import type { AlertCounts } from "@/lib/alerts";

// Ordered by how urgent the work is, not by count — a rank driven by count would put
// ถึงรอบตรวจนับ (every item that never had a count date) first and bury the four overdue
// returns. Labels match the /alerts tab each one opens (alerts/page.tsx `alertChips`), and
// `param` must match the query key that page reads.
//
// ponytail: onLoan is deliberately absent. It is a normal state, not an alert — the alert is
// overdueReturn. The old metric card labelled onLoan "ค้างส่งคืน", which overstated it.
const TYPES = [
  { param: "overdueReturn", label: "เกินกำหนดคืน", key: "overdueReturn", urgent: true },
  { param: "overdueMaint", label: "เกินกำหนดซ่อมบำรุง", key: "overdueMaintenance", urgent: true },
  { param: "lowStock", label: "ต่ำกว่าขั้นต่ำ", key: "lowStock", urgent: false },
  { param: "damagedPending", label: "ชำรุด (รอส่งซ่อม)", key: "damagedPending", urgent: false },
  { param: "nearExpiry", label: "ใกล้หมดอายุ", key: "nearExpiry", urgent: false },
  { param: "dueCount", label: "ถึงรอบตรวจนับ", key: "dueCount", urgent: false },
] as const satisfies ReadonlyArray<{ param: string; label: string; key: keyof AlertCounts; urgent: boolean }>;

export function DashboardAlertBar({ counts }: { counts: AlertCounts }) {
  const open = TYPES.filter((t) => counts[t.key] > 0);
  const urgent = open.some((t) => t.urgent);

  if (open.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-success/10">
          <CheckCircle2 className="size-4 text-success" />
        </span>
        <p className="text-sm text-muted-foreground">ไม่มีรายการต้องดำเนินการ</p>
      </div>
    );
  }

  return (
    // One strip, not a toolbar: the counts scroll horizontally as chips instead of wrapping to
    // five ragged lines on mobile, and each chip is its own tap target into /alerts.
    <section
      className={`animate-rise flex flex-wrap items-center gap-2 rounded-2xl border p-2 ${
        urgent ? "border-danger-500/20 bg-danger-500/5" : "border-warning/25 bg-warning/5"
      }`}
    >
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${
          urgent ? "bg-danger-500 text-white" : "bg-warning text-warning-foreground"
        }`}
      >
        <AlertTriangle className="size-3.5" />
        ต้องจัดการ
      </span>

      <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {open.map((t) => (
          <Link
            key={t.param}
            href={`/alerts?${t.param}=true`}
            className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="whitespace-nowrap text-muted-foreground">{t.label}</span>
            <span
              className={`text-sm font-bold tabular-nums ${
                t.urgent ? "text-danger-700 dark:text-danger-400" : "text-foreground"
              }`}
            >
              {counts[t.key]}
            </span>
          </Link>
        ))}
      </div>

      <Link
        href="/alerts"
        className={`inline-flex shrink-0 items-center gap-0.5 px-2 text-xs font-semibold hover:underline max-sm:hidden ${
          urgent ? "text-danger-700 dark:text-danger-400" : "text-warning-700 dark:text-warning-200"
        }`}
      >
        ดูทั้งหมด
        <ChevronRight className="size-3.5" />
      </Link>
    </section>
  );
}
