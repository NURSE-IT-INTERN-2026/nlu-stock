import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { effectiveCode } from "@/lib/constants";
import { NextRequest } from "next/server";

// Written-off copies drop off the schedule — a disposed/lost piece has no next round.
const WRITTEN_OFF = ["DISPOSED", "LOST"] as const;

function locationLabel(loc: { building: string | null; floor: string | null; room: string | null; detail: string | null } | null): string {
  return [loc?.building, loc?.floor, loc?.room, loc?.detail].filter(Boolean).join(" / ");
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const { page, perPage, skip, take } = paginate(params);

  const dateFrom = params.get("dateFrom") || undefined;
  const dateTo = params.get("dateTo") || undefined;
  const locationId = params.get("locationId") || undefined;

  // Date filter applies to whichever nextMaintenanceDate is the source of truth
  // (sub-item for tracked, item for flat).
  const dateFilter: Record<string, unknown> = { not: null };
  if (dateFrom) dateFilter.gte = new Date(dateFrom);
  if (dateTo) dateFilter.lte = new Date(dateTo + "T23:59:59");

  const locFilter = locationId ? { locationId } : {};

  // ponytail: in-memory merge of the two sources, move to a SQL UNION if it ever grows.
  // Tracked → one row per live copy (source of truth = SubItem dates).
  const [subs, flatItems] = await Promise.all([
    prisma.subItem.findMany({
      where: {
        nextMaintenanceDate: dateFilter,
        status: { notIn: [...WRITTEN_OFF] },
        item: { isActive: true, trackIndividually: true, ...locFilter },
      },
      include: {
        item: {
          select: {
            id: true,
            code: true,
            name: true,
            model: true,
            maintenanceCycleMonths: true,
            category: { select: { id: true, name: true, profileId: true } },
            location: { select: { building: true, floor: true, room: true, detail: true } },
            _count: { select: { subItems: true } },
          },
        },
      },
    }),
    // Flat (non-tracked, e.g. วัสดุคงทน) → one row per item (source of truth = Item dates).
    prisma.item.findMany({
      where: {
        isActive: true,
        trackIndividually: false,
        nextMaintenanceDate: dateFilter,
        ...locFilter,
      },
      include: {
        category: { select: { id: true, name: true, profileId: true } },
        location: { select: { building: true, floor: true, room: true, detail: true } },
      },
    }),
  ]);

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const statusOf = (next: Date) => (next < now ? "overdue" : next <= in30Days ? "due-soon" : "normal");

  type Row = {
    id: string;
    itemId: string;
    subItemId: string | null;
    subCode: string | null;
    code: string;
    name: string;
    model: string;
    categoryName: string;
    // Ids + raw location parts so a client can drive the shared items filter bar off these rows.
    categoryId: string;
    profileId: string;
    building: string;
    floor: string;
    room: string;
    detail: string;
    status: string;
    location: string;
    lastMaintenanceDate: string;
    nextMaintenanceDate: string;
    maintenanceCycleMonths: number;
    maintenanceStatus: string;
    subItemStatus: string | null;
  };

  const trackedRows: Row[] = subs.map((s) => {
    const next = s.nextMaintenanceDate!;
    return {
      id: s.id, // row key = sub-item id
      itemId: s.item.id,
      subItemId: s.id,
      subCode: s.subCode,
      code: effectiveCode(s.item.code, s.subCode, s.item._count.subItems),
      name: s.item.name,
      model: s.item.model ?? "",
      categoryName: s.item.category.name,
      categoryId: s.item.category.id,
      profileId: s.item.category.profileId,
      building: s.item.location?.building ?? "",
      floor: s.item.location?.floor ?? "",
      room: s.item.location?.room ?? "",
      detail: s.item.location?.detail ?? "",
      status: s.status,
      location: locationLabel(s.item.location),
      lastMaintenanceDate: s.lastMaintenanceDate?.toISOString() ?? "",
      nextMaintenanceDate: next.toISOString(),
      maintenanceCycleMonths: s.item.maintenanceCycleMonths,
      maintenanceStatus: statusOf(next),
      subItemStatus: s.status,
    };
  });

  const flatRows: Row[] = flatItems.map((i) => {
    const next = i.nextMaintenanceDate!;
    return {
      id: i.id,
      itemId: i.id,
      subItemId: null,
      subCode: null,
      code: i.code,
      name: i.name,
      model: i.model ?? "",
      categoryName: i.category.name,
      categoryId: i.category.id,
      profileId: i.category.profileId,
      building: i.location?.building ?? "",
      floor: i.location?.floor ?? "",
      room: i.location?.room ?? "",
      detail: i.location?.detail ?? "",
      status: i.status,
      location: locationLabel(i.location),
      lastMaintenanceDate: i.lastMaintenanceDate?.toISOString() ?? "",
      nextMaintenanceDate: next.toISOString(),
      maintenanceCycleMonths: i.maintenanceCycleMonths,
      maintenanceStatus: statusOf(next),
      subItemStatus: null,
    };
  });

  const merged = [...trackedRows, ...flatRows].sort(
    (a, b) => new Date(a.nextMaintenanceDate).getTime() - new Date(b.nextMaintenanceDate).getTime(),
  );

  const total = merged.length;
  const data = merged.slice(skip, skip + take);

  return json({ items: data, page, perPage, total });
}
