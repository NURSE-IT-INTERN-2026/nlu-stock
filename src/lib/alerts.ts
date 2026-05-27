import { prisma } from "@/lib/prisma";

export interface AlertCounts {
  lowStock: number;
  nearExpiry: number;
  overdueMaintenance: number;
  total: number;
}

export async function getAlertCounts(): Promise<AlertCounts> {
  const now = new Date();
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const [lowStockRows, nearExpiry, overdueMaint] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) FROM items WHERE "availableQty" < "minThreshold" AND "isActive" = true
    `,
    prisma.lot.count({
      where: { expiryDate: { gte: now, lte: in90Days } },
    }),
    prisma.item.count({
      where: { nextMaintenanceDate: { lt: now }, isActive: true },
    }),
  ]);

  const lowStock = Number(lowStockRows[0]?.count ?? 0);
  return { lowStock, nearExpiry, overdueMaintenance: overdueMaint, total: lowStock + nearExpiry + overdueMaint };
}
