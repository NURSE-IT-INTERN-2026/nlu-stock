import { prisma } from "@/lib/prisma";

export interface AlertCounts {
  lowStock: number;
  nearExpiry: number;
  overdueMaintenance: number;
  total: number;
  totalItems: number;
  onLoan: number;
}

export async function getAlertCounts(): Promise<AlertCounts> {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [lowStockRows, nearExpiry, overdueMaint, totalItems, onLoan] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) FROM items WHERE "availableQty" < "minThreshold" AND "isActive" = true
    `,
    prisma.lot.count({
      where: { expiryDate: { gte: now, lte: in30Days } },
    }),
    prisma.item.count({
      where: { nextMaintenanceDate: { lt: now }, isActive: true },
    }),
    prisma.item.count({
      where: { isActive: true },
    }),
    prisma.dispenseRecord.count({
      where: { returnedAt: null },
    }),
  ]);

  const lowStock = Number(lowStockRows[0]?.count ?? 0);
  return {
    lowStock,
    nearExpiry,
    overdueMaintenance: overdueMaint,
    total: lowStock + nearExpiry + overdueMaint,
    totalItems,
    onLoan,
  };
}
