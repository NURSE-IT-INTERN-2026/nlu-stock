import { prisma } from "@/lib/prisma";
import { requireAdmin, json, error, parseBody, getSearchParams, paginate } from "@/lib/api-utils";
import { itemCreateSchema } from "@/lib/validators";
import { sanitizeItemByProfile, isItemTracked } from "@/lib/category-profile";
import { NextRequest } from "next/server";
import { Prisma, ItemStatus } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
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

  const status = params.get("status");
  if (status) {
    const list = status.split(",").filter(Boolean);
    if (list.length === 1) where.status = list[0] as ItemStatus;
    else if (list.length > 1) where.status = { in: list as ItemStatus[] };
  }

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

  return json({ items, page, perPage, total });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
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

  const item = await prisma.item.create({
    data,
    include: { category: { include: { profile: true } }, location: true, issueUnit: true },
  });

  return json(item, 201);
}
