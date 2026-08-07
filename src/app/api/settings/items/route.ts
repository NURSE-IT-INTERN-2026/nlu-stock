import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, json, error, parseBody, getSearchParams, paginate } from "@/lib/api-utils";
import { itemCreateSchema } from "@/lib/validators";
import { sanitizeItemByProfile, isItemTracked } from "@/lib/category-profile";
import { countCycleFor, nextCountFrom } from "@/lib/stock-count";
import { nextMaintenanceFromCycle } from "@/lib/maintenance";
import { itemStatusWhere, andWhere } from "@/lib/item-status-where";
import { NextRequest } from "next/server";
import { Prisma, ItemStatus } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const { page, perPage, skip, take } = paginate(params);

  const where: Prisma.ItemWhereInput = {};

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

  const profileId = params.get("profileId");
  if (profileId) where.category = { profileId };

  // Same matching as /api/items — a tracked item's สูญหาย/ตัดจำหน่าย pieces no longer show in
  // its aggregate status, so filtering on Item.status alone found nothing here.
  const statusList = (params.get("status") ?? "").split(",").filter(Boolean) as ItemStatus[];
  andWhere(where, itemStatusWhere(statusList));

  const locationId = params.get("locationId");
  if (locationId) where.locationId = locationId;

  // Location cascade: filter every record under a building/floor/room/detail node.
  const building = params.get("building");
  const floor = params.get("floor");
  const room = params.get("room");
  const detail = params.get("detail");
  if (building || floor || room || detail) {
    where.location = {
      ...(building && { building }),
      ...(floor && { floor }),
      ...(room && { room }),
      ...(detail && { detail }),
    };
  }

  const trackIndividually = params.get("trackIndividually");
  if (trackIndividually !== null) where.trackIndividually = trackIndividually === "true";

  // Default: show all (active + inactive). Admin manages both here; inactive rows render faded client-side.
  const activeParam = params.get("active");
  if (activeParam === "true") where.isActive = true;
  else if (activeParam === "false") where.isActive = false;

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (params.get("lowStock") === "true") {
    const lowStockIds = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM items WHERE "availableQty" < "minThreshold" AND "isActive" = true
    `;
    where.id = { in: lowStockIds.map((r) => r.id) };
  }
  if (params.get("nearExpiry") === "true") where.lots = { some: { expiryDate: { gte: now, lte: in30Days } } };
  if (params.get("onLoan") === "true") where.dispenseRecords = { some: { returnedAt: null } };
  if (params.get("overdueMaint") === "true") where.nextMaintenanceDate = { lt: now };

  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      skip,
      take,
      orderBy: { code: "asc" },
      include: {
        category: { include: { profile: true } },
        location: true,
        issueUnit: true,
        _count: { select: { subItems: true, dispenseRecords: true, receiveRecords: true } },
      },
    }),
    prisma.item.count({ where }),
  ]);

  // Per-status sub-item counts for tracked items — the delete dialog shows a breakdown
  // (พร้อมใช้งาน/ยืมอยู่/ซ่อมอยู่/ใช้งาน) and blocks when pieces are out. One groupBy for the page.
  const trackedIds = items.filter((i) => i.trackIndividually).map((i) => i.id);
  const groups = trackedIds.length
    ? await prisma.subItem.groupBy({
        by: ["itemId", "status"],
        where: { itemId: { in: trackedIds } },
        _count: { _all: true },
      })
    : [];
  const countsByItem = new Map<string, Partial<Record<ItemStatus, number>>>();
  for (const g of groups) {
    const entry = countsByItem.get(g.itemId) ?? {};
    entry[g.status] = g._count._all;
    countsByItem.set(g.itemId, entry);
  }
  const itemsWithCounts = items.map((i) =>
    i.trackIndividually ? { ...i, statusCounts: countsByItem.get(i.id) ?? {} } : i,
  );

  return json({ items: itemsWithCounts, page, perPage, total });
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { data, error: parseError } = await parseBody(itemCreateSchema)(request);
  if (parseError) return parseError;
  if (!data) return error("No data");

  const existing = await prisma.item.findUnique({ where: { code: data.code } });
  if (existing) return error("Item code already exists");

  // Enforce trackIndividually based on profile
  const cat = await prisma.categoryType.findUnique({ where: { id: data.categoryId }, include: { profile: true } });
  if (cat?.profile) {
    data.trackIndividually = isItemTracked(cat.profile);
    sanitizeItemByProfile(cat.profile, data);
  }

  // First count is due one cycle from creation — a brand new item isn't overdue.
  const nextCountDate = cat?.profile
    ? nextCountFrom(new Date(), countCycleFor(cat.profile.dispenseType, data.countCycleMonths))
    : null;

  // Same for maintenance: seed the first due date so a new durable enters the
  // cycle immediately. Only flat (non-tracked) items carry the schedule on the Item —
  // tracked items schedule per copy on the SubItem, seeded when copies are created,
  // and have no sub-items yet at this create step. Consumables get no cycle at all.
  // Baseline = lastMaintenanceDate (if supplied) else purchaseDate else today.
  const maintBaseline = (data.lastMaintenanceDate ?? data.purchaseDate ?? new Date()) as Date;
  const nextMaintenanceDate =
    cat?.profile && cat.profile.dispenseType !== "CONSUMABLE" && !data.trackIndividually
      ? nextMaintenanceFromCycle(maintBaseline, data.maintenanceCycleMonths)
      : null;

  const item = await prisma.item.create({
    data: {
      ...data,
      ...(nextCountDate ? { nextCountDate } : {}),
      ...(nextMaintenanceDate ? { nextMaintenanceDate } : {}),
    },
    include: { category: { include: { profile: true } }, location: true, issueUnit: true },
  });

  return json(item, 201);
}
