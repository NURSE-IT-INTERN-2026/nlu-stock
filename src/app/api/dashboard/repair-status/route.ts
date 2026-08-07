import { prisma } from "@/lib/prisma";
import { requireAuth, json } from "@/lib/api-utils";
import { NextRequest } from "next/server";

// รอส่งซ่อม (DAMAGED) / กำลังซ่อม (UNDER_REPAIR), summed across flat items + tracked sub-items.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const [itemDamaged, itemUnderRepair, subDamaged, subUnderRepair] = await Promise.all([
    prisma.item.count({ where: { isActive: true, trackIndividually: false, status: "DAMAGED" } }),
    prisma.item.count({ where: { isActive: true, trackIndividually: false, status: "UNDER_REPAIR" } }),
    prisma.subItem.count({ where: { status: "DAMAGED", item: { isActive: true } } }),
    prisma.subItem.count({ where: { status: "UNDER_REPAIR", item: { isActive: true } } }),
  ]);

  return json({ damaged: itemDamaged + subDamaged, underRepair: itemUnderRepair + subUnderRepair });
}
