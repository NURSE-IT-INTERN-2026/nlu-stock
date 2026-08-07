import { prisma } from "@/lib/prisma";
import { requireAuth, json } from "@/lib/api-utils";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  // Per-profile stock-status buckets. Each active item lands in exactly one bucket:
  //   out  = availableQty 0, low = 0 < availableQty < minThreshold (same predicate as the
  //   low-stock alert in lib/alerts.ts), ok = availableQty >= minThreshold.
  const groups = await prisma.$queryRaw<Array<{
    profileId: string; total: bigint; ok: bigint; low: bigint; out: bigint;
  }>>`
    SELECT c."profileId" AS "profileId",
      COUNT(*) AS total,
      SUM(CASE WHEN i."availableQty" > 0 AND i."availableQty" >= i."minThreshold" THEN 1 ELSE 0 END) AS ok,
      SUM(CASE WHEN i."availableQty" > 0 AND i."availableQty" <  i."minThreshold" THEN 1 ELSE 0 END) AS low,
      SUM(CASE WHEN i."availableQty" = 0 THEN 1 ELSE 0 END) AS out
    FROM items i
    JOIN categories c ON c.id = i."categoryId"
    WHERE i."isActive" = true
    GROUP BY c."profileId"
  `;

  const profiles = await prisma.categoryProfile.findMany({
    where: { id: { in: groups.map((g) => g.profileId) } },
    select: { id: true, name: true, sortOrder: true, icon: true, color: true },
  });
  const profMap = new Map(profiles.map((p) => [p.id, p]));

  const data = groups
    .map((g) => {
      const p = profMap.get(g.profileId);
      if (!p) return null;
      return {
        profileId: p.id,
        profileName: p.name,
        sortOrder: p.sortOrder,
        icon: p.icon,
        color: p.color,
        count: Number(g.total),
        ok: Number(g.ok),
        low: Number(g.low),
        out: Number(g.out),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder: _sortOrder, ...rest }) => rest);

  return json(data);
}
