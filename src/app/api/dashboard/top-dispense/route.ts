import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const categoryId = params.get("categoryId") || undefined;
  const profileId = params.get("profileId") || undefined;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const itemFilter = categoryId
    ? { item: { categoryId } }
    : profileId
      ? { item: { category: { profileId } } }
      : {};

  const groups = await prisma.dispenseRecord.groupBy({
    by: ["itemId"],
    where: {
      dispensedAt: { gte: startOfMonth },
      ...itemFilter,
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
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
      return { ...item, totalQuantity: g._sum.quantity ?? 0 };
    })
    .filter(Boolean) as Array<{ id: string; code: string; name: string; totalQuantity: number }>;

  return json(data);
}
