import { prisma } from "@/lib/prisma";
import { USAGE_TYPE_LABELS } from "@/lib/constants";

export type UsageBySubjectRow = {
  usageType: string | null;
  courseCode: string | null;
  label: string;
  totalQuantity: number;
};

/** Usage totals with COURSE split per รหัสวิชา — the whole point of the report is "which
 *  subject used what", which one lumped รายวิชา bucket cannot answer. usageNote carries the
 *  course name as it read at dispense time; ACTIVITY/OTHER leave both course columns null,
 *  so they still collapse into one row each.
 *
 *  Shared by the report route and the export route so the two cannot drift into disagreeing
 *  about the same numbers. */
export async function groupUsageBySubject(where: Record<string, unknown>): Promise<UsageBySubjectRow[]> {
  const groups = await prisma.dispenseRecord.groupBy({
    by: ["usageType", "courseCode", "usageNote"],
    where: { ...where, usageType: { not: null } },
    _sum: { quantity: true },
  });

  // A course renamed between two dispenses lands in two groups under one code. Merge on the
  // key so the report shows one row per subject, and let the first snapshot name it.
  const merged = new Map<string, UsageBySubjectRow>();
  for (const g of groups) {
    const isCourse = g.usageType === "COURSE";
    const key = isCourse ? `COURSE:${g.courseCode ?? ""}` : String(g.usageType);
    const typeLabel = USAGE_TYPE_LABELS[g.usageType ?? ""] ?? g.usageType ?? "Unknown";
    // Legacy COURSE rows predate the picker and carry no code — keep them visible in their
    // own bucket rather than dropping them, or historical totals stop reconciling.
    const label = !isCourse
      ? typeLabel
      : g.courseCode
        ? [g.courseCode, g.usageNote].filter(Boolean).join(" — ")
        : `${typeLabel} (ไม่ระบุ)`;

    const row = merged.get(key);
    if (row) row.totalQuantity += g._sum.quantity ?? 0;
    else merged.set(key, { usageType: g.usageType, courseCode: g.courseCode, label, totalQuantity: g._sum.quantity ?? 0 });
  }

  return [...merged.values()].sort((a, b) => b.totalQuantity - a.totalQuantity);
}
