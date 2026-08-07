import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, requireAuth, json, error, parseBody } from "@/lib/api-utils";
import { categoryCreateSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const q = request.nextUrl.searchParams.get("q");
  const where = q ? { name: { contains: q, mode: "insensitive" as const } } : {};

  const categories = await prisma.categoryType.findMany({
    where,
    orderBy: { sortOrder: "asc" },
    include: { profile: true, _count: { select: { items: true } } },
  });

  return json(categories);
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { data, error: parseErr } = await parseBody(categoryCreateSchema)(request);
  if (parseErr) return parseErr;
  if (!data) return error("No data");

  if (!data.sortOrder) {
    const max = await prisma.categoryType.aggregate({ _max: { sortOrder: true } });
    data.sortOrder = (max._max.sortOrder ?? 0) + 1;
  }

  const category = await prisma.categoryType.create({ data });

  return json(category, 201);
}
