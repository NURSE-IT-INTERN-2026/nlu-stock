import { prisma } from "@/lib/prisma";
import { requireAdmin, json, error, parseBody } from "@/lib/api-utils";
import { categoryCreateSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const categories = await prisma.categoryType.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { items: true } } },
  });

  return json(categories);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
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
