import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const year = Number(params.get("year") || new Date().getFullYear());
  const categoryId = params.get("categoryId") || undefined;

  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year, 11, 31, 23, 59, 59);

  const itemWhere: Record<string, unknown> = {
    purchaseDate: { gte: startOfYear, lte: endOfYear },
    isActive: true,
    purchasePrice: { not: null },
  };
  if (categoryId) itemWhere.categoryId = categoryId;

  const maintWhere: Record<string, unknown> = {
    performedAt: { gte: startOfYear, lte: endOfYear },
    cost: { not: null },
  };
  if (categoryId) maintWhere.item = { categoryId };

  const [purchases, repairs] = await Promise.all([
    prisma.item.findMany({
      where: itemWhere,
      select: {
        id: true,
        code: true,
        name: true,
        purchasePrice: true,
        purchaseDate: true,
        category: { select: { name: true } },
      },
      orderBy: { purchaseDate: "desc" },
    }),
    prisma.maintenanceRecord.findMany({
      where: maintWhere,
      include: {
        item: { select: { code: true, name: true, category: { select: { name: true } } } },
        performer: { select: { name: true } },
      },
      orderBy: { performedAt: "desc" },
    }),
  ]);

  const purchaseData = purchases.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    purchasePrice: p.purchasePrice ?? 0,
    purchaseDate: p.purchaseDate!.toISOString(),
    categoryName: p.category.name,
  }));

  const repairData = repairs.map((r) => ({
    id: r.id,
    itemCode: r.item.code,
    itemName: r.item.name,
    categoryName: r.item.category.name,
    cost: r.cost ?? 0,
    performedAt: r.performedAt.toISOString(),
    type: r.type,
    performer: r.performer.name,
  }));

  const totalPurchase = purchaseData.reduce((s, p) => s + p.purchasePrice, 0);
  const totalRepair = repairData.reduce((s, r) => s + r.cost, 0);

  // Group by category for chart
  const categoryMap = new Map<string, { totalPurchase: number; totalRepair: number }>();
  for (const p of purchaseData) {
    const entry = categoryMap.get(p.categoryName) ?? { totalPurchase: 0, totalRepair: 0 };
    entry.totalPurchase += p.purchasePrice;
    categoryMap.set(p.categoryName, entry);
  }
  for (const r of repairData) {
    const entry = categoryMap.get(r.categoryName) ?? { totalPurchase: 0, totalRepair: 0 };
    entry.totalRepair += r.cost;
    categoryMap.set(r.categoryName, entry);
  }

  const byCategory = Array.from(categoryMap.entries()).map(([categoryName, vals]) => ({
    categoryName,
    ...vals,
  }));

  return json({
    purchases: purchaseData,
    repairs: repairData,
    totalPurchase,
    totalRepair,
    byCategory,
  });
}
