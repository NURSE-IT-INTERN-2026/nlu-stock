import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, requireAuth, json, error, parseBody } from "@/lib/api-utils";
import { profileCreateSchema } from "@/lib/validators";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const q = request.nextUrl.searchParams.get("q");
  const where = q ? { name: { contains: q, mode: "insensitive" as const } } : {};

  const profiles = await prisma.categoryProfile.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { subCategories: true } } },
  });

  return json(profiles);
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.denied) return auth.denied;

  const { data, error: parseErr } = await parseBody(profileCreateSchema)(request);
  if (parseErr) return parseErr;
  if (!data) return error("No data");

  // Auto-assign next sortOrder unless caller provided one.
  if (!data.sortOrder) {
    const max = await prisma.categoryProfile.aggregate({ _max: { sortOrder: true } });
    data.sortOrder = (max._max.sortOrder ?? 0) + 1;
  }

  try {
    const profile = await prisma.categoryProfile.create({ data });
    return json(profile, 201);
  } catch {
    // Unique violation on code or name.
    return error("รหัสหรือชื่อประเภทซ้ำ", 409);
  }
}
