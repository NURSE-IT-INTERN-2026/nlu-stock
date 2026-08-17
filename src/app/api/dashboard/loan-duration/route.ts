import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { parseScope, scopeDispenseWhere } from "@/lib/dashboard-scope-where";
import { LOAN_BUCKETS, loanBucket, type LoanBucket } from "@/lib/dashboard-usage";

/**
 * ระยะเวลาการยืม — how long loans that came back were actually out, over the last 12 months.
 *
 * Closed loans only. An open loan has no duration yet, and folding it into "เกิน 7 วัน" would
 * make that bar grow every night on its own; `stillOut` ships beside the buckets so the card
 * next to the chart can name what is not in it.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const scope = parseScope(getSearchParams(request));
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const where = scopeDispenseWhere(scope);

  const [closed, stillOut] = await Promise.all([
    prisma.dispenseRecord.findMany({
      where: { ...where, returnedAt: { not: null, gte: start } },
      select: { dispensedAt: true, returnedAt: true },
    }),
    prisma.dispenseRecord.count({ where: { ...where, returnedAt: null } }),
  ]);

  const counts = Object.fromEntries(LOAN_BUCKETS.map((b) => [b, 0])) as Record<LoanBucket, number>;
  for (const r of closed) counts[loanBucket(r.dispensedAt, r.returnedAt!)] += 1;

  return json({ counts, closed: closed.length, stillOut });
}
