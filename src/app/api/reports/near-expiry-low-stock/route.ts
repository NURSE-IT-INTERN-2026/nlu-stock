import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const categoryId = params.get("categoryId") || undefined;

  const now = new Date();
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const itemWhere: Record<string, unknown> = { isActive: true };
  if (categoryId) itemWhere.categoryId = categoryId;

  const [lowStock, nearExpiry] = await Promise.all([
    prisma.item.findMany({
      where: {
        ...itemWhere,
        availableQty: { lt: prisma.item.fields.minThreshold },
      },
      include: { category: { select: { name: true } } },
      orderBy: { minThreshold: "desc" },
    }),
    prisma.lot.findMany({
      where: {
        expiryDate: { gte: now, lte: in90Days },
        item: { isActive: true, ...(categoryId ? { categoryId } : {}) },
      },
      include: {
        item: {
          select: {
            code: true,
            name: true,
            issueUnit: true,
            category: { select: { name: true } },
          },
        },
      },
      orderBy: { expiryDate: "asc" },
    }),
  ]);

  const lowStockData = lowStock.map((i) => ({
    id: i.id,
    code: i.code,
    name: i.name,
    categoryName: i.category.name,
    availableQty: i.availableQty,
    minThreshold: i.minThreshold,
    totalQty: i.totalQty,
    issueUnit: i.issueUnit,
  }));

  const nearExpiryData = nearExpiry.map((l) => ({
    id: l.id,
    lotNumber: l.lotNumber,
    expiryDate: l.expiryDate!.toISOString(),
    quantity: l.quantity,
    itemCode: l.item.code,
    itemName: l.item.name,
    categoryName: l.item.category.name,
    issueUnit: l.item.issueUnit,
    daysUntilExpiry: Math.ceil(
      (l.expiryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    ),
  }));

  return json({ lowStock: lowStockData, nearExpiry: nearExpiryData });
}
