import { prisma } from "@/lib/prisma";
import { countOpenCases } from "@/lib/cases";

export interface AlertCounts {
  lowStock: number;
  nearExpiry: number;
  overdueMaintenance: number;
  overdueReturn: number;
  damagedPending: number;
  dueCount: number;
  /** เคสที่ยังมีคนรออยู่ — ซ่อม, สูญหาย, ยืมเลยกำหนด. เกณฑ์อยู่ที่ isTodo ใน lib/cases. */
  openCases: number;
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
  const [lowStockIds, nearExpiry, overdueMaint, totalItems, onLoan, overdueLoans, damagedPending, dueCount, openCases] = await Promise.all([
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
    // (schedule on Item). Pieces + items looks like mixed units but is not: the
    // maintenance-schedule table this feeds (/maintenance, filter "overdue") emits exactly
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
      // somewhere with no due date. เบิกใช้ (CONSUME) is not one either, and it has no item
      // filter beside it to catch that: while เบิกใช้ still filed as a null/BORROW row, every
      // consumable ever drawn counted here as ค้าง and could never clear (returnedAt stays
      // null forever by design).
      where: {
        dispenseRecords: {
          some: { returnedAt: null, loanType: "BORROW" },
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
    // Reported-damaged, not yet sent to repair — counted as worklist ROWS, matching what the
    // chip's panel renders: one per damaged piece, plus one per open qty แจ้งชำรุด booking
    // still waiting to be sent (repairSentAt null). The qty half used to be left out because
    // the panel read sub_items only and could not render it; it now reads /api/repairs too,
    // so the badge and the list agree again. A booking already at the shop is not pending —
    // it sits on รับคืนจากส่งซ่อม instead.
    Promise.all([
      prisma.subItem.count({ where: { status: "DAMAGED" } }),
      prisma.stockAdjustment.count({
        where: { reason: "DAMAGED_PENDING_REPAIR", recoveredAt: null, repairSentAt: null },
      }),
    ]).then(([a, b]) => a + b),
    // ถึงรอบตรวจนับ — null nextCountDate = never counted, also due.
    prisma.item.count({
      where: { isActive: true, OR: [{ nextCountDate: null }, { nextCountDate: { lt: now } }] },
    }),
    // นับเป็นใบเคส ตรงกับที่แท็บ รายการสิ่งที่ต้องทำ แสดงเป็นแถว — พัสดุชิ้นเดียวที่มีสองงานค้าง
    // เป็นสองแถวที่นั่น จึงต้องเป็นสองที่นี่.
    countOpenCases(),
  ]);

  const lowStock = lowStockIds.length;
  const overdueReturn = new Set(overdueLoans.map((r) => r.loanGroupId ?? r.id)).size;

  // "ทั้งหมด" = how many alerts are outstanding, added across the chips. It is NOT the row
  // count of the ทั้งหมด tab and cannot be: the chips count different things (items, pieces,
  // loan events) and one item can raise several alerts at once. The tab paginates distinct
  // items. onLoan is not an alert — it is a normal state, filtered on /items instead.
  // openCases อยู่ในยอดรวมด้วย ไม่งั้นคลังที่มีแต่เคสค้างจะได้ total = 0 แล้วหน้า /alerts คืน
  // empty state ทิ้งไปทั้งหน้า ก่อนจะทันวาดแถบแท็บที่แท็บนั้นอยู่.
  //
  // เกณฑ์ว่าอะไรบวกเข้ายอดรวมได้: **แท็บนั้นยังอยู่บน /alerts หรือเปล่า** — สี่ตัวแรกมีแท็บของตัวเอง
  // บวก openCases ที่เป็นแท็บ `todo`. overdueReturn กับ damagedPending ไม่อยู่ในนี้ ทั้งที่ยัง
  // คำนวณไว้ให้แถบบนหน้าแรกใช้: แท็บของมันย้ายไป /receive กับ /repairs แล้ว และของสองก้อนนั้น
  // ถูกนับอยู่ใน openCases อยู่ก่อนแล้ว (isTodo รับ BORROW ที่เลยกำหนด, ชิ้น DAMAGED เปิดเป็นเคส
  // REPAIR) — บวกเข้ามาอีกคือนับสองรอบ. ยอดรวมนี้เคยเป็น 1685 โดยที่ 286 ใบยืมเลยกำหนดถูกนับ
  // ทั้งใน overdueReturn และใน openCases.
  //
  // สี่ตัวแรก **ไม่ใช่** เซ็ตเดียวกับที่แท็บ "ทั้งหมด" query (api/items `alerts=true`) แม้จะใช้
  // เกณฑ์ตระกูลเดียวกัน: lowStock/nearExpiry/dueCount ตรงกันจริง แต่ overdueMaint ที่นี่นับ
  // ชิ้น (SubItem.nextMaintenanceDate) รวมกับพัสดุแบบ flat ส่วน union ฝั่งโน้นดูแค่
  // Item.nextMaintenanceDate — คนละหน่วยและคนละเซ็ต. ยอดรวมนี้ไม่เคยรับประกันว่าเท่ากับจำนวน
  // แถวในแท็บไหน มันตอบแค่ "มีเรื่องค้างกี่เรื่อง".
  //
  // ผลพลอยที่รู้อยู่: ถ้า item alert เป็น 0 หมดแต่ openCases > 0 badge จะขึ้น N ทั้งที่ตารางใน
  // แท็บ "ทั้งหมด" ว่าง — แถวพวกนั้นอยู่แท็บ `todo` ถัดไป. เป็น trade-off เดียวกับที่ย่อหน้าแรก
  // เลือกไว้: badge ที่ไม่นับ openCases จะพาไป empty state ที่ทิ้งทั้งหน้า ซึ่งแย่กว่า.
  const total = lowStock + nearExpiry + overdueMaint + dueCount + openCases;

  return {
    lowStock,
    nearExpiry,
    overdueMaintenance: overdueMaint,
    overdueReturn,
    damagedPending,
    dueCount,
    openCases,
    total,
    totalItems,
    onLoan,
  };
}
