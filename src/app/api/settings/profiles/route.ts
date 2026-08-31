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

  // Items hang off the profile through CategoryType, so Prisma cannot count them in the
  // include above. The edit form needs the number to grey out the fields that freeze once a
  // profile holds stock — without it the lock only shows up as a 409 after Save.
  const counts = await prisma.item.groupBy({
    by: ["categoryId"],
    _count: { _all: true },
  });
  const categories = await prisma.categoryType.findMany({ select: { id: true, profileId: true } });
  const byProfile = new Map<string, number>();
  for (const c of counts) {
    const profileId = categories.find((x) => x.id === c.categoryId)?.profileId;
    if (profileId) byProfile.set(profileId, (byProfile.get(profileId) ?? 0) + c._count._all);
  }

  return json(
    profiles.map((p) => ({
      ...p,
      _count: { ...p._count, items: byProfile.get(p.id) ?? 0 },
    })),
  );
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
