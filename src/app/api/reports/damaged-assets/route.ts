import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { ItemStatus } from "@/generated/prisma/enums";
import { effectiveCode } from "@/lib/constants";

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

  // A tracked item's damaged/lost pieces don't show in its aggregate status any more
  // (see deriveStatusFromSubItems), so match the pieces directly too — this report is
  // where written-off stock is meant to be found.
  const where: Record<string, unknown> = {
    isActive: true,
    OR: [{ status: { in: statuses } }, { subItems: { some: { status: { in: statuses } } } }],
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
        _count: { select: { subItems: true } },
        subItems: {
          where: { status: { in: statuses } },
          select: { id: true, subCode: true, status: true },
          orderBy: { subCode: "asc" },
        },
        statusLogs: {
          where: { newStatus: { in: statuses } },
          orderBy: { changedAt: "desc" },
          take: 50,
          select: { changedAt: true, reason: true, subItemId: true, repairVenue: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
    prisma.item.count({ where }),
  ]);

  // Tracked items report per piece (which copy is damaged/lost); non-tracked stay one row.
  // Pagination still counts items, so a page can carry a few more rows than perPage.
  const data = items.flatMap((i) => {
    const locationLabel = [i.location?.building, i.location?.floor, i.location?.room, i.location?.detail]
      .filter(Boolean)
      .join(" / ");
    const base = { name: i.name, categoryName: i.category.name, location: locationLabel };
    const logFor = (subItemId: string | null) => i.statusLogs.find((l) => l.subItemId === subItemId);

    if (i.subItems.length > 0) {
      return i.subItems.map((s) => {
        const log = logFor(s.id);
        return {
          ...base,
          id: s.id,
          code: effectiveCode(i.code, s.subCode, i._count.subItems),
          status: s.status,
          reason: log?.reason ?? "",
          repairVenue: log?.repairVenue ?? null,
          changedAt: log?.changedAt.toISOString() ?? "",
        };
      });
    }

    const log = logFor(null) ?? i.statusLogs[0];
    return [{
      ...base,
      id: i.id,
      code: i.code,
      status: i.status,
      reason: log?.reason ?? "",
      repairVenue: log?.repairVenue ?? null,
      changedAt: log?.changedAt.toISOString() ?? "",
    }];
  });

  return json({ items: data, page, perPage, total });
}
