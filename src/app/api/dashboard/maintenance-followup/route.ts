import { prisma } from "@/lib/prisma";
import { requireAuth, json } from "@/lib/api-utils";
import { NextRequest } from "next/server";

// Preview list for "งานซ่อมที่ต้องติดตาม" — เกินกำหนดซ่อมบำรุงตามรอบ (nextMaintenanceDate
// in the past) but not yet sent to repair. Same predicate as getAlertCounts.overdueMaintenance.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const now = new Date();

  const [items, subItems] = await Promise.all([
    prisma.item.findMany({
      where: { isActive: true, trackIndividually: false, nextMaintenanceDate: { lt: now } },
      select: { id: true, code: true, name: true, nextMaintenanceDate: true },
      orderBy: { nextMaintenanceDate: "asc" },
      take: 5,
    }),
    prisma.subItem.findMany({
      where: { nextMaintenanceDate: { lt: now }, status: { notIn: ["DISPOSED", "LOST"] }, item: { isActive: true, trackIndividually: true } },
      select: { id: true, subCode: true, nextMaintenanceDate: true, item: { select: { id: true, code: true, name: true } } },
      orderBy: { nextMaintenanceDate: "asc" },
      take: 5,
    }),
  ]);

  const rows = [
    ...items.map((i) => ({ id: i.id, itemId: i.id, code: i.code, name: i.name, nextMaintenanceDate: i.nextMaintenanceDate! })),
    ...subItems.map((s) => ({ id: s.id, itemId: s.item.id, code: `${s.item.code}-${s.subCode}`, name: s.item.name, nextMaintenanceDate: s.nextMaintenanceDate! })),
  ]
    .sort((a, b) => a.nextMaintenanceDate.getTime() - b.nextMaintenanceDate.getTime())
    .slice(0, 5);

  return json(rows);
}
