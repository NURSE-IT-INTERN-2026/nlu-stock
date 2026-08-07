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

  // Each count must be in the same unit as the rows its chip opens — an item count over an
  // item table, a piece count over a piece panel. They differ by chip, and that is fine;
  // what is not fine is a badge in a unit its own list never renders.
  const [lowStockIds, nearExpiry, overdueMaint, totalItems, onLoan, overdueLoans, damagedPending, dueCount] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM items WHERE "availableQty" < "minThreshold" AND "isActive" = true
    `,
    // Near-expiry = within 30 days OR already expired (no lower bound), still holding stock.
    // Counted as ITEMS, not lots: this chip opens the items table, where an item holding four
    // expiring lots is one row. Counting lots made the badge say 12 over a list of 4 — and the
    // dashboard card repeated it under the word "รายการ". Same predicate the list filter uses
    // (api/items/route.ts `expiryAlert`); keep them in step.
    prisma.item.count({
      where: {
        isActive: true,
        lots: { some: { expiryDate: { lte: in30Days }, remainingQty: { gt: 0 } } },
      },
    }),
    // Overdue maintenance = live tracked copies (schedule on SubItem) + flat items
    // (schedule on Item). Pieces + items looks like mixed units but is not: this chip opens
    // OverdueMaintenancePanel, and the maintenance-schedule report behind it emits exactly
    // one row per live copy and one per flat item. Keep the two shapes in step.
    Promise.all([
      prisma.subItem.count({
        where: {
          nextMaintenanceDate: { lt: now },
          status: { notIn: ["DISPOSED", "LOST"] },
          item: { isActive: true, trackIndividually: true },
        },
      }),
      prisma.item.count({
        where: { nextMaintenanceDate: { lt: now }, isActive: true, trackIndividually: false },
      }),
    ]).then(([a, b]) => a + b),
    prisma.item.count({
      where: { isActive: true },
    }),
    prisma.item.count({
      // onLoan = ยืมออกไปและยังไม่คืน. นำไปใช้งาน (INUSE) is not a loan — it is stationed
      // somewhere with no due date, so it never counts as ค้าง. null loanType = legacy BORROW.
      where: {
        dispenseRecords: {
          some: {
            returnedAt: null,
            OR: [
              { loanType: null },
              { loanType: "BORROW" },
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
    // Reported-damaged, not yet sent to repair. Sub-items only, because the chip opens a
    // panel fed by GET /api/sub-items — a `subItem.findMany`, so a non-tracked item flagged
    // DAMAGED has no row there to be. Adding those to the badge only promised worklist rows
    // that cannot appear. They are not lost by this: nothing acts on a non-tracked DAMAGED
    // flag anywhere today (it moves no quantity and does not block a dispense), so the gap
    // to close is a write path for damaged qty, not a number on a chip.
    prisma.subItem.count({ where: { status: "DAMAGED" } }),
    // ถึงรอบตรวจนับ — null nextCountDate = never counted, also due.
    prisma.item.count({
      where: { isActive: true, OR: [{ nextCountDate: null }, { nextCountDate: { lt: now } }] },
    }),
  ]);

  const lowStock = lowStockIds.length;
  const overdueReturn = new Set(overdueLoans.map((r) => r.loanGroupId ?? r.id)).size;

  // "ทั้งหมด" = how many alerts are outstanding, added across the chips. It is NOT the row
  // count of the ทั้งหมด tab and cannot be: the chips count different things (items, pieces,
  // loan events) and one item can raise several alerts at once. The tab paginates distinct
  // items. onLoan is not an alert — it is a normal state, filtered on /items instead.
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
