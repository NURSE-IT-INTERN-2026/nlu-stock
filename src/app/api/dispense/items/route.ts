import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const profileId = searchParams.get("profileId") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");

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
        category: { select: { name: true, profile: { select: { dispenseType: true, assetTracking: true, setTracking: true, color: true } } } },
        issueUnit: { select: { id: true, name: true } },
        lots: {
          where: { remainingQty: { gt: 0 } },
          orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }],
          select: { id: true, lotNumber: true, expiryDate: true, remainingQty: true },
        },
        subItems: {
          where: { status: "AVAILABLE" },
          select: { id: true, subCode: true, status: true, condition: true },
        },
        location: { select: { building: true, floor: true, room: true, detail: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.item.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, limit });
}
