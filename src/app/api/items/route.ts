import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const { page, perPage, skip, take } = paginate(params);

  const where: Prisma.ItemWhereInput = { isActive: true };

  const search = params.get("search");
  if (search) {
    where.OR = [
      { code: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      { nameEn: { contains: search, mode: "insensitive" } },
    ];
  }

  const categoryId = params.get("categoryId");
  if (categoryId) where.categoryId = categoryId;

  const status = params.get("status") as Prisma.EnumItemStatusFilter;
  if (status) where.status = status;

  const locationId = params.get("locationId");
  if (locationId) where.locationId = locationId;

  const lowStock = params.get("lowStock");
  if (lowStock === "true") {
    const lowStockItems = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM items WHERE "availableQty" < "minThreshold" AND "isActive" = true
    `;
    where.id = { in: lowStockItems.map((r) => r.id) };
  }

  const nearExpiry = params.get("nearExpiry");
  if (nearExpiry === "true") {
    const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    where.lots = {
      some: { expiryDate: { gte: new Date(), lte: in90Days } },
    };
  }

  const overdueMaint = params.get("overdueMaint");
  if (overdueMaint === "true") {
    where.nextMaintenanceDate = { lt: new Date() };
  }

  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      skip,
      take,
      orderBy: { code: "asc" },
      include: {
        category: true,
        location: true,
        issueUnit: true,
        subUnit: true,
        _count: { select: { subItems: true } },
        lots: {
          where: { expiryDate: { not: null } },
          orderBy: { expiryDate: "asc" },
          take: 1,
        },
      },
    }),
    prisma.item.count({ where }),
  ]);

  return json({ items, page, perPage, total });
}
