import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { parseScope, scopeDispenseWhere } from "@/lib/dashboard-scope-where";
import { topCourses } from "@/lib/dashboard-usage";

/**
 * รายวิชาที่เบิกมากที่สุด, ranked by ครั้ง over the last 12 months.
 *
 * COURSE only. กิจกรรม/อื่นๆ/ตั้งใช้ในห้อง are not subjects and are not ranked here — but the
 * count of everything left out ships as `excluded` so the chart can say so out loud. Without
 * that line the bars read as "all the เบิก" and every total silently disagrees with /reports.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const scope = scopeDispenseWhere(parseScope(getSearchParams(request)));
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const window = { dispensedAt: { gte: start }, ...scope };

  const [groups, total] = await Promise.all([
    // usageNote is in the grouping only to name the bar; a course renamed between two draws
    // lands in two groups under one code and topCourses merges them back.
    prisma.dispenseRecord.groupBy({
      by: ["courseCode", "usageNote"],
      where: { ...window, usageType: "COURSE", courseCode: { not: null } },
      _count: { _all: true },
      _sum: { quantity: true },
    }),
    prisma.dispenseRecord.count({ where: window }),
  ]);

  const rows = topCourses(
    groups.map((g) => ({
      courseCode: g.courseCode,
      usageNote: g.usageNote,
      records: g._count._all,
      units: g._sum.quantity ?? 0,
    })),
  );

  const ranked = groups.reduce((n, g) => n + g._count._all, 0);
  return json({ rows, excluded: total - ranked });
}
