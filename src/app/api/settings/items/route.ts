import { prisma } from "@/lib/prisma";
import { requireAdmin, json, error, parseBody, getSearchParams, paginate } from "@/lib/api-utils";
import { itemCreateSchema } from "@/lib/validators";
import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";

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
      { nameTh: { contains: search, mode: "insensitive" } },
    ];
  }

  const categoryId = params.get("categoryId");
  if (categoryId) where.categoryId = categoryId;

  const status = params.get("status") as Prisma.EnumItemStatusFilter;
  if (status) where.status = status;

  const locationId = params.get("locationId");
  if (locationId) where.locationId = locationId;

  const trackIndividually = params.get("trackIndividually");
  if (trackIndividually !== null) where.trackIndividually = trackIndividually === "true";

  const activeParam = params.get("active");
  if (activeParam === "false") where.isActive = false;
  else if (activeParam !== "all") where.isActive = true;

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

  const item = await prisma.item.create({
    data,
    include: { category: true, location: true, issueUnit: true, subUnit: true },
  });

  return json(item, 201);
}
