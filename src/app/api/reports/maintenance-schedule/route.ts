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
  const locationId = params.get("locationId") || undefined;

  const where: Record<string, unknown> = {
    isActive: true,
    nextMaintenanceDate: { not: null },
  };
  if (dateFrom || dateTo) {
    const dateFilter: Record<string, unknown> = { not: null };
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo + "T23:59:59");
    where.nextMaintenanceDate = dateFilter;
  }
  if (locationId) where.locationId = locationId;

  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      include: {
        category: { select: { name: true } },
        location: { select: { building: true, floor: true, room: true, detail: true } },
      },
      orderBy: { nextMaintenanceDate: "asc" },
      skip,
      take,
    }),
    prisma.item.count({ where }),
  ]);

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const data = items.map((i) => {
    const next = i.nextMaintenanceDate!;
    let maintenanceStatus = "normal";
    if (next < now) maintenanceStatus = "overdue";
    else if (next <= in30Days) maintenanceStatus = "due-soon";

    return {
      id: i.id,
      code: i.code,
      name: i.name,
      model: i.model ?? "",
      categoryName: i.category.name,
      location: [i.location?.building, i.location?.floor, i.location?.room, i.location?.detail]
        .filter(Boolean)
        .join(" / "),
      lastMaintenanceDate: i.lastMaintenanceDate?.toISOString() ?? "",
      nextMaintenanceDate: next.toISOString(),
      maintenanceCycleMonths: i.maintenanceCycleMonths,
      maintenanceStatus,
    };
  });

  return json({ items: data, page, perPage, total });
}
