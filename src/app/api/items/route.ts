import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { Prisma, ItemStatus } from "@/generated/prisma/client";

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

  // Location level filter (cascade): filter every record under a building/floor/room/detail node.
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

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const lowStock = params.get("lowStock");
  if (lowStock === "true") {
    const lowStockItems = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM items WHERE "availableQty" < "minThreshold" AND "isActive" = true
    `;
    where.id = { in: lowStockItems.map((r) => r.id) };
  }

  const nearExpiry = params.get("nearExpiry");
  if (nearExpiry === "true") {
    where.lots = {
      some: { expiryDate: { gte: now, lte: in30Days } },
    };
  }

  const onLoan = params.get("onLoan");
  if (onLoan === "true") {
    where.dispenseRecords = { some: { returnedAt: null } };
  }

  const overdueMaint = params.get("overdueMaint");
  if (overdueMaint === "true") {
    where.nextMaintenanceDate = { lt: now };
  }

  // Union mode: items matching ANY alert condition (used by /alerts page).
  const alerts = params.get("alerts");
  if (alerts === "true") {
    const lowStockIds = (await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM items WHERE "availableQty" < "minThreshold" AND "isActive" = true
    `).map((r) => r.id);
    where.OR = [
      { id: { in: lowStockIds } },
      { lots: { some: { expiryDate: { gte: now, lte: in30Days } } } },
      { nextMaintenanceDate: { lt: now } },
    ];
  }

  const [rawItems, total] = await Promise.all([
    prisma.item.findMany({
      where,
      skip,
      take,
      orderBy: { code: "asc" },
      include: {
        category: { include: { profile: true } },
        location: true,
        issueUnit: true,
        _count: { select: { subItems: true } },
        lots: {
          where: { expiryDate: { gte: now, lte: in30Days } },
          orderBy: { expiryDate: "asc" },
          take: 1,
        },
      },
    }),
    prisma.item.count({ where }),
  ]);

  // Derive per-item alert types for the /alerts page (badge column).
  const items = rawItems.map((item) => {
    const types: string[] = [];
    if (item.availableQty < item.minThreshold) types.push("lowStock");
    if (item.lots.length > 0) types.push("nearExpiry");
    if (item.nextMaintenanceDate && new Date(item.nextMaintenanceDate) < now) types.push("overdueMaint");
    return { ...item, alertTypes: types };
  });

  return json({ items, page, perPage, total });
}
