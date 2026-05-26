import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const categoryId = params.get("categoryId") || undefined;

  const where: Record<string, unknown> = { isActive: true };
  if (categoryId) where.categoryId = categoryId;

  const groups = await prisma.item.groupBy({
    by: ["categoryId"],
    where,
    _sum: { totalQty: true, availableQty: true },
    _count: true,
  });

  const categoryIds = groups.map((g) => g.categoryId);
  const categories = await prisma.categoryType.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true },
  });

  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  const data = groups.map((g) => ({
    categoryId: g.categoryId,
    categoryName: catMap.get(g.categoryId) ?? "Unknown",
    totalItems: g._count,
    totalQty: g._sum.totalQty ?? 0,
    availableQty: g._sum.availableQty ?? 0,
  }));

  return json(data);
}
