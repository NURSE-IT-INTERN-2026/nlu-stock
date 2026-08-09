"use client";

import { cn } from "@/lib/utils";

export interface SummaryStat {
  label: string;
  value: string | number;
  /** One line under the number saying what it is counted from. Every headline number on a
   *  report is a slice of something bigger, and a report that doesn't say which slice is how
   *  "มูลค่าคงเหลือรวม" came to read as the value of the whole storeroom when it was three items. */
  hint?: string;
  tone?: "default" | "warning" | "danger";
}

const TONES: Record<NonNullable<SummaryStat["tone"]>, string> = {
  default: "",
  warning: "text-warning-700 dark:text-warning-200",
  danger: "text-destructive dark:text-danger-400",
};

/** The two-line answer a tab owes the reader before its table: what am I looking at, and how
 *  much of it is there. Shared so all report tabs answer in the same shape. */
export function ReportSummary({ stats }: { stats: SummaryStat[] }) {
  return (
    // Stacked full-height cards ate the whole first screen on a phone before any data showed,
    // so mobile lays each one out as a single label→value row instead.
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border bg-card p-3">
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn("text-lg font-bold tabular-nums", TONES[s.tone ?? "default"])}>{s.value}</p>
          </div>
          {s.hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{s.hint}</p>}
        </div>
      ))}
    </div>
  );
}
