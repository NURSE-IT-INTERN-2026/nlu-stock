import { prisma } from "@/lib/prisma";
import { requireAuth, json } from "@/lib/api-utils";
import { NextRequest } from "next/server";

// Preview list for the "คืนเกินกำหนด" widget — same predicate as getAlertCounts.overdueReturn
// in lib/alerts.ts, oldest due date first, capped to 5 rows.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const records = await prisma.dispenseRecord.findMany({
    where: {
      returnedAt: null,
      dueAt: { lt: new Date() },
      item: { category: { profile: { dispenseType: { in: ["COUNT", "ITEM"] } } } },
    },
    select: {
      id: true,
      dueAt: true,
      quantity: true,
      item: { select: { id: true, code: true, name: true } },
      staff: { select: { name: true } },
    },
    orderBy: { dueAt: "asc" },
    take: 5,
  });

  return json(records);
}
