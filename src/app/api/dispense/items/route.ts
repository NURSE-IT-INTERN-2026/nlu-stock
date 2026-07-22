import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams, paginate } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;

  const searchParams = getSearchParams(req);
  const { page, perPage, skip, take } = paginate(searchParams);

  const q = searchParams.get("q")?.trim() ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const profileId = searchParams.get("profileId") ?? "";

  // Location cascade filter (building → floor → room → detail)
  const building = searchParams.get("building") ?? "";
  const floor = searchParams.get("floor") ?? "";
  const room = searchParams.get("room") ?? "";
  const detail = searchParams.get("detail") ?? "";
  const hasLoc = building || floor || room || detail;

  const where = {
    isActive: true,
    ...(q && {
      OR: [
        { code: { contains: q, mode: "insensitive" as const } },
        { name: { contains: q, mode: "insensitive" as const } },
        { nameEn: { contains: q, mode: "insensitive" as const } },
      ],
    }),
    ...(categoryId && { categoryId }),
    ...(profileId && { category: { profileId } }),
    ...(hasLoc && {
      location: {
        ...(building && { building }),
        ...(floor && { floor }),
        ...(room && { room }),
        ...(detail && { detail }),
      },
    }),
  };

  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      include: {
        category: { select: { name: true, profile: { select: { name: true, dispenseType: true, assetTracking: true, setTracking: true, color: true } } } },
        issueUnit: { select: { id: true, name: true } },
        lots: {
          where: { remainingQty: { gt: 0 } },
          // FEFO first; date-coded lots (no expiry) all tie, so fall back to FIFO on
          // receivedDate — otherwise their order is whatever the DB feels like.
          orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedDate: "asc" }],
          select: { id: true, lotNumber: true, expiryDate: true, remainingQty: true },
        },
        subItems: {
          where: { status: "AVAILABLE" },
          select: { id: true, subCode: true, status: true, condition: true },
        },
        location: { select: { building: true, floor: true, room: true, detail: true } },
      },
      orderBy: { name: "asc" },
      skip,
      take,
    }),
    prisma.item.count({ where }),
  ]);

  return json({ items, total, page, perPage });
}
