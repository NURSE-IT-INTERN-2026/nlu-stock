import { prisma } from "@/lib/prisma";
import { requireAuth, json } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const groups = await prisma.item.groupBy({
    by: ["categoryId"],
    where: { isActive: true },
    _count: true,
  });

  const cats = await prisma.categoryType.findMany({
    where: { id: { in: groups.map((g) => g.categoryId) } },
    select: { id: true, profile: { select: { id: true, name: true, sortOrder: true, icon: true, color: true } } },
  });
  const catMap = new Map(cats.map((c) => [c.id, c.profile]));

  const byProfile = new Map<string, { profileId: string; profileName: string; sortOrder: number; icon: string; color: string; count: number }>();
  for (const g of groups) {
    const profile = catMap.get(g.categoryId);
    if (!profile) continue;
    const cur = byProfile.get(profile.id);
    if (cur) cur.count += g._count;
    else byProfile.set(profile.id, { profileId: profile.id, profileName: profile.name, sortOrder: profile.sortOrder, icon: profile.icon, color: profile.color, count: g._count });
  }

  const data = [...byProfile.values()].sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ profileId, profileName, icon, color, count }) => ({ profileId, profileName, icon, color, count }));

  return json(data);
}
