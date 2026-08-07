import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
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
      <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-success/10">
          <CheckCircle2 className="size-4 text-success" />
        </span>
        <p className="text-sm text-muted-foreground">ไม่มีรายการต้องดำเนินการ</p>
      </div>
    );
  }

  return (
    // One surface, not a toolbar: the counts read as a sentence so the bar says "here is the
    // state of things" rather than offering six buttons the /alerts page already offers.
    // items-start, not center: on mobile the counts wrap to several lines and a vertically
    // centred icon floats in the middle of an empty column.
    <div className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3 sm:items-center">
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${urgent ? "bg-danger-500/10" : "bg-warning/10"}`}>
        <AlertTriangle className={`size-4 ${urgent ? "text-danger-500" : "text-warning"}`} />
      </span>

      {/* Two layouts, because one does not survive both ends. The row needs ~820px to sit on
          one line and only gets that on a wide screen with the sidebar collapsed; below ~640px
          six Thai labels wrap to five ragged lines, so there it becomes a stacked list with
          the count flushed right — same data, scannable, one tap target per row.

          The sm+ layout must be flex-wrap, not inline text: the items are `whitespace-nowrap`
          with no whitespace between them in JSX, so as inline text there is no break
          opportunity at all and the counts overflow the card and run under the ดูทั้งหมด
          button. The separator trails *inside* each item so no line opens with a stray bullet,
          and it is hidden in the stacked layout where rows separate themselves. */}
      <div className="flex min-w-0 flex-1 flex-col gap-y-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2">
        {open.map((t, i) => (
          <span key={t.param} className="whitespace-nowrap">
            <Link
              href={`/alerts?${t.param}=true`}
              className="flex items-baseline justify-between gap-2 rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline"
            >
              <span>{t.label}</span>{" "}
              <span className={`font-bold tabular-nums ${t.urgent ? "text-danger-700 dark:text-danger-400" : "text-foreground"}`}>
                {counts[t.key]}
              </span>
            </Link>
            {i < open.length - 1 && <span className="ml-2 hidden select-none text-border sm:inline">•</span>}
          </span>
        ))}
      </div>

      <Link href="/alerts" className={`${buttonVariants({ variant: "outline", size: "sm" })} shrink-0 max-sm:hidden`}>
        ดูทั้งหมด
        <ChevronRight className="size-3.5" />
      </Link>
    </div>
  );
}
