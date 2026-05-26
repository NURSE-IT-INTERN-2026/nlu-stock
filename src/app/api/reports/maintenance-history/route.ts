import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const { page, perPage, skip, take } = paginate(params);

  const dateFrom = params.get("dateFrom") || undefined;
  const dateTo = params.get("dateTo") || undefined;
  const type = params.get("maintenanceType") || undefined;
  const itemId = params.get("itemId") || undefined;

  const where: Record<string, unknown> = {};
  if (dateFrom || dateTo) {
    where.performedAt = {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
    };
  }
  if (type) where.type = type;
  if (itemId) where.itemId = itemId;

  const [records, total] = await Promise.all([
    prisma.maintenanceRecord.findMany({
      where,
      include: {
        item: { select: { code: true, name: true, category: { select: { name: true } } } },
        performer: { select: { name: true } },
      },
      orderBy: { performedAt: "desc" },
      skip,
      take,
    }),
    prisma.maintenanceRecord.count({ where }),
  ]);

  const data = records.map((r) => ({
    id: r.id,
    itemCode: r.item.code,
    itemName: r.item.name,
    categoryName: r.item.category.name,
    type: r.type,
    result: r.result,
    issue: r.issue ?? "",
    description: r.description ?? "",
    cost: r.cost ?? 0,
    performer: r.performer.name,
    performedAt: r.performedAt.toISOString(),
  }));

  return json({ records: data, page, perPage, total });
}
