import { prisma } from "@/lib/prisma";

export interface AlertCounts {
  lowStock: number;
  nearExpiry: number;
  overdueMaintenance: number;
  overdueReturn: number;
  damagedPending: number;
  dueCount: number;
  total: number;
  totalItems: number;
  onLoan: number;
}

export async function getAlertCounts(): Promise<AlertCounts> {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [lowStockIds, nearExpiry, overdueMaint, totalItems, onLoan, overdueLoans, damagedSubItems, damagedItems, dueCount] = await Promise.all([
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
      // onLoan = ยืมออกไป (incl. COUNT-type ตั้งใช้ในห้อง still outstanding numerically).
      // Per-unit (trackIndividually) INUSE returned via คืนเข้าพัสดุ — excluded here.
      where: {
        dispenseRecords: {
          some: {
            returnedAt: null,
            OR: [
              { loanType: null },
              { loanType: "BORROW" },
              { AND: [{ loanType: "INUSE" }, { item: { trackIndividually: false } }] },
            ],
          },
        },
      },
    }),
    // Open loans past their due date. Select the grouping keys so we can count
    // distinct loan *events* (one card per loanGroupId in the return panel),
    // not raw lines — legacy null-group records each count as their own event.
    prisma.dispenseRecord.findMany({
      where: {
        returnedAt: null,
        dueAt: { lt: now },
        item: { category: { profile: { dispenseType: { in: ["COUNT", "ITEM"] } } } },
      },
      select: { id: true, loanGroupId: true },
    }),
    // Reported-damaged, not yet sent to repair — tracked sub-items.
    prisma.subItem.count({ where: { status: "DAMAGED" } }),
    // Same, for non-tracked (count-based) items.
    prisma.item.count({ where: { status: "DAMAGED", trackIndividually: false, isActive: true } }),
    // ถึงรอบตรวจนับ — null nextCountDate = never counted, also due.
    prisma.item.count({
      where: { isActive: true, OR: [{ nextCountDate: null }, { nextCountDate: { lt: now } }] },
    }),
  ]);

  const lowStock = lowStockIds.length;
  const overdueReturn = new Set(overdueLoans.map((r) => r.loanGroupId ?? r.id)).size;
  const damagedPending = damagedSubItems + damagedItems;

  // "ทั้งหมด" = sum of alert-type counts (each chip added together). onLoan is NOT an alert —
  // it's a normal operational state, surfaced as a filter on /items instead. The table paginates
  // distinct items separately, so this need not equal the row count.
  const total = lowStock + nearExpiry + overdueMaint + overdueReturn + damagedPending + dueCount;

  return {
    lowStock,
    nearExpiry,
    overdueMaintenance: overdueMaint,
    overdueReturn,
    damagedPending,
    dueCount,
    total,
    totalItems,
    onLoan,
  };
}
