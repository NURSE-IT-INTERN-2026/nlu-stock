import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { parseScope, scopeDispenseWhere } from "@/lib/dashboard-scope-where";

/**
 * พัสดุที่ถูกเบิกบ่อยที่สุด over the last 12 months.
 *
 * Ranked by ครั้ง (records), not หน่วย: the old _sum.quantity ranking put whatever ships in
 * hundreds at the top forever, which says more about the issue unit than about the item.
 * `totalQuantity` still rides along for the tooltip. 12 months to match the other two charts
 * on the page — three widgets on different windows is a reading error waiting to happen.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const itemFilter = scopeDispenseWhere(parseScope(getSearchParams(request)));

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const groups = await prisma.dispenseRecord.groupBy({
    by: ["itemId"],
    where: {
      dispensedAt: { gte: start },
      ...itemFilter,
    },
    _count: { _all: true },
    _sum: { quantity: true },
    orderBy: { _count: { itemId: "desc" } },
    take: 7,
  });

  const itemIds = groups.map((g) => g.itemId);
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, code: true, name: true },
  });

  const itemMap = new Map(items.map((i) => [i.id, i]));

  const data = groups
    .map((g) => {
      const item = itemMap.get(g.itemId);
      if (!item) return null;
      return { ...item, records: g._count._all, totalQuantity: g._sum.quantity ?? 0 };
    })
    .filter(Boolean) as Array<{ id: string; code: string; name: string; records: number; totalQuantity: number }>;

  return json(data);
}
