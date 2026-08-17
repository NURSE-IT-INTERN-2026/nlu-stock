/**
 * The dashboard reads การเบิกออก in ครั้ง (records), not หน่วย. A 500-piece draw of สำลี and a
 * one-box draw of ถุงมือ are both one trip to the storeroom, and "how often is this touched"
 * is the question the หน้าแรก answers; the unit totals live in /reports.
 *
 * Both helpers here are pure so the branching (which series a record belongs to, which
 * courses make the cut) can be asserted without a database — see dashboard-usage.test.ts.
 */

/** Series of the stacked เบิกออก column, in stack order. */
export const USAGE_SERIES = ["COURSE", "ACTIVITY", "OTHER", "STATION", "UNKNOWN"] as const;
export type UsageSeries = (typeof USAGE_SERIES)[number];

export const USAGE_SERIES_LABELS: Record<UsageSeries, string> = {
  COURSE: "รายวิชา",
  ACTIVITY: "กิจกรรม",
  OTHER: "อื่นๆ",
  STATION: "ตั้งใช้ในห้อง",
  UNKNOWN: "ไม่ระบุ",
};

/** One CSS var per series, so the stack keeps the same colour on every tab. */
export const USAGE_SERIES_COLORS: Record<UsageSeries, string> = {
  COURSE: "--chart-1",
  ACTIVITY: "--chart-2",
  OTHER: "--chart-3",
  STATION: "--chart-4",
  UNKNOWN: "--chart-5",
};

/**
 * นำไปใช้งาน (INUSE) is filed by station-in-room-dialog, which carries a required locationId
 * and no usageType at all — the room IS the reason. So the series comes off loanType first;
 * reading usageType alone would file every ตั้งใช้ในห้อง draw under "ไม่ระบุ" and make the
 * grey band look like a data-entry problem instead of a real category.
 *
 * UNKNOWN is left for what it actually is now: rows written before usageType was required on
 * เบิก/ยืม (validators/dispense.ts refuses them today).
 */
export function usageSeries(r: { loanType: string | null; usageType: string | null }): UsageSeries {
  if (r.loanType === "INUSE") return "STATION";
  return (USAGE_SERIES as readonly string[]).includes(r.usageType ?? "")
    ? (r.usageType as UsageSeries)
    : "UNKNOWN";
}

/** ระยะเวลาการยืม buckets, in order. */
export const LOAN_BUCKETS = ["d1", "d2_3", "d4_7", "d8plus"] as const;
export type LoanBucket = (typeof LOAN_BUCKETS)[number];

export const LOAN_BUCKET_LABELS: Record<LoanBucket, string> = {
  d1: "คืนใน 1 วัน",
  d2_3: "2–3 วัน",
  d4_7: "4–7 วัน",
  d8plus: "เกิน 7 วัน",
};

/**
 * How long a loan was out, bucketed. Whole days, floored, so anything returned inside 24
 * hours is "คืนใน 1 วัน" — the borrower's day, not a fraction on a clock.
 *
 * Only closed loans are ever passed in: an open one would climb a bucket every night with
 * nothing having happened, which makes the chart look like behaviour changed when it did not.
 */
export function loanBucket(dispensedAt: Date, returnedAt: Date): LoanBucket {
  const days = Math.floor((returnedAt.getTime() - dispensedAt.getTime()) / 86_400_000);
  if (days <= 0) return "d1";
  if (days <= 2) return "d2_3";
  if (days <= 6) return "d4_7";
  return "d8plus";
}

export interface CourseGroup {
  courseCode: string | null;
  /** course name snapshotted at dispense time */
  usageNote: string | null;
  records: number;
  units: number;
}

export interface CourseRow {
  courseCode: string;
  label: string;
  records: number;
  units: number;
}

/**
 * Ranks รายวิชา by ครั้ง. Rows without a courseCode are dropped, not bucketed: the chart
 * answers "วิชาไหนเบิกเยอะ" and a bar with no subject on it is not an answer (the count of
 * everything left out is shown as a caption instead, sourced separately).
 *
 * A course renamed between two draws arrives as two groups under one code — merged here, and
 * the first snapshot names it, same rule as lib/usage-by-subject.ts.
 */
export function topCourses(groups: CourseGroup[], limit = 8): CourseRow[] {
  const merged = new Map<string, CourseRow>();
  for (const g of groups) {
    const code = g.courseCode?.trim();
    if (!code) continue;
    const row = merged.get(code) ?? {
      courseCode: code,
      label: [code, g.usageNote?.trim()].filter(Boolean).join(" — "),
      records: 0,
      units: 0,
    };
    row.records += g.records;
    row.units += g.units;
    merged.set(code, row);
  }
  return [...merged.values()]
    .sort((a, b) => b.records - a.records || a.courseCode.localeCompare(b.courseCode, "th"))
    .slice(0, limit);
}
