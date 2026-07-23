import { NextRequest } from "next/server";
import { requireAuth, json } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { denied } = await requireAuth(request);
  if (denied) return denied;

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Start of current month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // Start of next month
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Counts must match the schedule rows: one per live tracked copy (source = SubItem
  // dates) plus one per flat item (source = Item dates). Written-off copies excluded.
  const trackedWhere = (range: object) => ({
    nextMaintenanceDate: range,
    status: { notIn: ["DISPOSED", "LOST"] as ("DISPOSED" | "LOST")[] },
    item: { isActive: true, trackIndividually: true },
  });
  const flatWhere = (range: object) => ({
    nextMaintenanceDate: range,
    isActive: true,
    trackIndividually: false,
  });

  const [overdueSub, overdueFlat, dueSoonSub, dueSoonFlat, completedThisMonth] = await Promise.all([
    prisma.subItem.count({ where: trackedWhere({ lt: now }) }),
    prisma.item.count({ where: flatWhere({ lt: now }) }),
    prisma.subItem.count({ where: trackedWhere({ gte: now, lte: in30Days }) }),
    prisma.item.count({ where: flatWhere({ gte: now, lte: in30Days }) }),
    prisma.maintenanceRecord.count({
      where: { performedAt: { gte: monthStart, lt: monthEnd } },
    }),
  ]);

  return json({
    overdue: overdueSub + overdueFlat,
    dueSoon: dueSoonSub + dueSoonFlat,
    completedThisMonth,
  });
}
