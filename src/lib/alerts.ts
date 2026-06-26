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

  const [lowStockIds, nearExpiry, overdueMaint, totalItems, onLoan] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM items WHERE "availableQty" < "minThreshold" AND "isActive" = true
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
    prisma.item.count({
      where: { dispenseRecords: { some: { returnedAt: null } } },
    }),
  ]);

  const lowStock = lowStockIds.length;

  // "ทั้งหมด" = sum of alert-type counts (each chip added together). onLoan is NOT an alert —
  // it's a normal operational state, surfaced as a filter on /items instead. The table paginates
  // distinct items separately, so this need not equal the row count.
  const total = lowStock + nearExpiry + overdueMaint;

  return {
    lowStock,
    nearExpiry,
    overdueMaintenance: overdueMaint,
    total,
    totalItems,
    onLoan,
  };
}
