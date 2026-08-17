"use client";

import { cn } from "@/lib/utils";
import { tokenText, tokenTint, tokenVar, type Token } from "./report-kit";

export interface SummaryStat {
  label: string;
  value: string | number;
  /** Colours the card with its event colour. Omit and the card stays plain, so the tabs that
   *  have not been reworked yet keep the look they have today. */
  token?: Token;
  /** One line under the number saying what it is counted from. Every headline number on a
   *  report is a slice of something bigger, and a report that doesn't say which slice is how
   *  "มูลค่าคงเหลือรวม" came to read as the value of the whole storeroom when it was three items. */
  hint?: string;
  /** Sits opposite the label, on the same line. */
  icon?: React.ComponentType<{ className?: string }>;
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
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className={cn("rounded-lg border p-3 text-left", s.token ? "" : "bg-card")}
          style={
            s.token
              ? {
                  backgroundColor: tokenTint(s.token, 10),
                  borderColor: `color-mix(in oklab, ${tokenVar[s.token]} 30%, transparent)`,
                }
              : undefined
          }
        >
          {/* Label row owns the icon, then the number, then the caveat — one reading order at
              every width. The label used to jump to the left of the value on phones, which put
              the numbers down the middle of the column instead of on a line you can scan.
              No uppercase/tracking from the mock: the labels are Thai, where uppercase is a
              no-op and letter-spacing only breaks up the cluster. */}
          <div className={cn("flex items-center justify-between gap-2", s.token && tokenText[s.token])}>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            {s.icon && <s.icon className="size-4 shrink-0" />}
          </div>
          <p
            className={cn(
              "mt-1 text-xl leading-none font-bold tabular-nums",
              s.token ? tokenText[s.token] : TONES[s.tone ?? "default"],
            )}
          >
            {s.value}
          </p>
          {s.hint && <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>}
        </div>
      ))}
    </div>
  );
}
