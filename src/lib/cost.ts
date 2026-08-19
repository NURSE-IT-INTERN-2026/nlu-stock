import type { Prisma } from "@/generated/prisma/client";

/** ราคาต่อหน่วยถัวเฉลี่ยถ่วงน้ำหนักจากรายการรับเข้าที่มีราคา — ค่าที่ Item.purchasePrice เก็บไว้
 *  ให้รายงานมูลค่าคงคลังตีราคาของคงทน.
 *
 *  Weighted by quantity, not a plain average of the prices: receiving 10 pieces at ฿100 and
 *  1 more at ฿10 leaves the stock worth ฿91.8 each, not ฿55. Rows with no price are the
 *  caller's to exclude — an unpriced receipt is unknown, and averaging it in as 0 would
 *  quietly mark stock down every time someone skipped the field.
 *
 *  Returns null when nothing priced is left to average, so the caller writes null (ไม่ทราบ
 *  ราคา) rather than 0 (ฟรี). */
export function weightedUnitCost(rows: { quantity: number; unitCost: number | null }[]): number | null {
  const priced = rows.filter((r) => r.unitCost != null && r.quantity > 0);
  const qty = priced.reduce((s, r) => s + r.quantity, 0);
  if (qty === 0) return null;
  return priced.reduce((s, r) => s + r.quantity * r.unitCost!, 0) / qty;
}

type TxClient = Prisma.TransactionClient;

/** Re-derive ราคาต่อหน่วยของพัสดุคงทน จากใบรับเข้าที่กรอกราคาไว้.
 *
 *  Item.purchasePrice is what มูลค่าคงคลัง values durable stock at, and receipts are where
 *  prices are actually entered — deriving it here means a price typed on ANY receipt, new or
 *  corrected months later, reaches the report the same way. purchaseDate is filled only when
 *  empty: it is when the asset first arrived, which warranty and maintenance cycles read, not
 *  the date of the latest delivery. */
export async function syncItemPurchasePrice(tx: TxClient, itemId: string, firstReceivedAt?: Date) {
  const priced = await tx.receiveRecord.findMany({
    where: { itemId, unitCost: { not: null } },
    select: { quantity: true, unitCost: true },
  });
  const avg = weightedUnitCost(priced);
  if (avg == null) return;
  const item = await tx.item.findUnique({ where: { id: itemId }, select: { purchaseDate: true } });
  await tx.item.update({
    where: { id: itemId },
    data: {
      purchasePrice: avg,
      ...(item?.purchaseDate == null && firstReceivedAt ? { purchaseDate: firstReceivedAt } : {}),
    },
  });
}

/** Re-derive a lot's ราคาต่อหน่วย from the receipts that went into it.
 *
 *  Derived rather than accumulated: the old code folded each new receipt into the stored
 *  average weighted by REMAINING quantity, which cannot be recomputed and cannot be corrected —
 *  fixing a mistyped price left the average carrying the mistake forever. Receipts are the
 *  record; this is a view of them, so it survives an edit. */
export async function syncLotUnitCost(tx: TxClient, lotId: string) {
  const priced = await tx.receiveRecord.findMany({
    where: { lotId },
    select: { quantity: true, unitCost: true },
  });
  await tx.lot.update({ where: { id: lotId }, data: { unitCost: weightedUnitCost(priced) } });
}
