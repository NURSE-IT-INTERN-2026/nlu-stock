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

  const [overdue, dueSoon, completedThisMonth] = await Promise.all([
    prisma.item.count({
      where: { nextMaintenanceDate: { lt: now }, isActive: true },
    }),
    prisma.item.count({
      where: {
        nextMaintenanceDate: { gte: now, lte: in30Days },
        isActive: true,
      },
    }),
    prisma.maintenanceRecord.count({
      where: { performedAt: { gte: monthStart, lt: monthEnd } },
    }),
  ]);

  return json({ overdue, dueSoon, completedThisMonth });
}
