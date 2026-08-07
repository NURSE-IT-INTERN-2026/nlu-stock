import { prisma } from "@/lib/prisma";
import { requireAuth, json } from "@/lib/api-utils";
import { NextRequest } from "next/server";

// Preview list for the "รายการใกล้หมด / หมดสต็อก" widget — same predicate as
// getAlertCounts.lowStock in lib/alerts.ts (availableQty < minThreshold), emptiest first.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const rows = await prisma.$queryRaw<
    Array<{ id: string; code: string; name: string; availableQty: number; minThreshold: number; unitName: string }>
  >`
    SELECT i.id, i.code, i.name, i."availableQty", i."minThreshold", u.name AS "unitName"
    FROM items i
    JOIN units u ON u.id = i."issueUnitId"
    WHERE i."availableQty" < i."minThreshold" AND i."isActive" = true
    ORDER BY i."availableQty" ASC
    LIMIT 5
  `;

  const items = rows.map((r) => ({
    id: r.id, code: r.code, name: r.name,
    availableQty: r.availableQty, minThreshold: r.minThreshold,
    issueUnit: { name: r.unitName },
  }));

  return json(items);
}
