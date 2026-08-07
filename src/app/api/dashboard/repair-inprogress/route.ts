import { prisma } from "@/lib/prisma";
import { requireAuth, json } from "@/lib/api-utils";
import { NextRequest } from "next/server";

// Worklist preview: pieces/items currently ส่งซ่อม, most recently moved first.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const [items, subItems] = await Promise.all([
    prisma.item.findMany({
      where: { isActive: true, trackIndividually: false, status: "UNDER_REPAIR" },
      select: { id: true, code: true, name: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.subItem.findMany({
      where: { status: "UNDER_REPAIR", item: { isActive: true } },
      select: { id: true, subCode: true, updatedAt: true, item: { select: { id: true, code: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  const rows = [
    ...items.map((i) => ({ id: i.id, itemId: i.id, code: i.code, name: i.name, updatedAt: i.updatedAt })),
    ...subItems.map((s) => ({ id: s.id, itemId: s.item.id, code: `${s.item.code}-${s.subCode}`, name: s.item.name, updatedAt: s.updatedAt })),
  ]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 5);

  return json(rows);
}
