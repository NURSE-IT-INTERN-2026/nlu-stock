import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { parseScope, scopeDispenseWhere } from "@/lib/dashboard-scope-where";
import { USAGE_SERIES, usageSeries, type UsageSeries } from "@/lib/dashboard-usage";

const MONTH_LABELS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/**
 * เบิกออก per month, split by what it was used for — replaces the old รับเข้า-vs-เบิกออก
 * area chart. รับเข้า is not on the dashboard any more: /reports › เข้าคลัง owns it, and the
 * question this page answers is where stock goes, not where it comes from.
 *
 * Counted in ครั้ง (records). `units` rides along per bucket for the tooltip only — the bar
 * height is records, or the chart is the old quantity chart wearing new labels.
 *
 * No groupBy: the series is derived per row (loanType before usageType, see usageSeries), and
 * SQL grouping cannot express that without duplicating the rule in two places.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const scope = scopeDispenseWhere(parseScope(getSearchParams(request)));
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const records = await prisma.dispenseRecord.findMany({
    where: { dispensedAt: { gte: start }, ...scope },
    select: { dispensedAt: true, quantity: true, usageType: true, loanType: true },
  });

  const zeroed = () => Object.fromEntries(USAGE_SERIES.map((s) => [s, 0])) as Record<UsageSeries, number>;
  const buckets = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, month: MONTH_LABELS[d.getMonth()], records: zeroed(), units: zeroed() };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  for (const r of records) {
    const b = byKey.get(`${r.dispensedAt.getFullYear()}-${r.dispensedAt.getMonth()}`);
    if (!b) continue;
    const series = usageSeries(r);
    b.records[series] += 1;
    b.units[series] += r.quantity;
  }

  return json(buckets.map(({ month, records, units }) => ({ month, records, units })));
}
