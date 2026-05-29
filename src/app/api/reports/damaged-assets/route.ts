import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { ItemStatus } from "@/generated/prisma/enums";

const DAMAGE_STATUSES: ItemStatus[] = ["DAMAGED", "UNDER_REPAIR", "DISPOSED", "LOST"];

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const { page, perPage, skip, take } = paginate(params);

  const status = params.get("status") || undefined;
  const dateFrom = params.get("dateFrom") || undefined;
  const dateTo = params.get("dateTo") || undefined;

  const statuses: ItemStatus[] = status ? [status as ItemStatus] : DAMAGE_STATUSES;

  const where: Record<string, unknown> = {
    isActive: true,
    status: { in: statuses },
  };

  if (dateFrom || dateTo) {
    where.statusLogs = {
      some: {
        newStatus: { in: statuses },
        ...(dateFrom || dateTo
          ? {
              changedAt: {
                ...(dateFrom && { gte: new Date(dateFrom) }),
                ...(dateTo && { lte: new Date(dateTo + "T23:59:59") }),
              },
            }
          : {}),
      },
    };
  }

  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      include: {
        category: { select: { name: true } },
        location: { select: { building: true, floor: true, room: true, detail: true } },
        statusLogs: {
          where: { newStatus: { in: statuses } },
          orderBy: { changedAt: "desc" },
          take: 1,
          select: { changedAt: true, reason: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
    prisma.item.count({ where }),
  ]);

  const data = items.map((i) => ({
    id: i.id,
    code: i.code,
    name: i.name,
    status: i.status,
    categoryName: i.category.name,
    location: [i.location?.building, i.location?.floor, i.location?.room, i.location?.detail]
      .filter(Boolean)
      .join(" / "),
    reason: i.statusLogs[0]?.reason ?? "",
    changedAt: i.statusLogs[0]?.changedAt.toISOString() ?? "",
  }));

  return json({ items: data, page, perPage, total });
}
