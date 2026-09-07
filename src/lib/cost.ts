import type { Prisma } from "@/generated/prisma/client";
import { AdjustmentReason, ItemStatus } from "@/generated/prisma/enums";

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

/** Re-derive ราคาต่อหน่วยของพัสดุ จากใบรับเข้าที่กรอกราคาไว้.
 *
 *  Item.purchasePrice is what มูลค่าคงคลัง values stock at, and receipts are where prices are
 *  actually entered — deriving it here means a price typed on ANY receipt, new or corrected
 *  months later, reaches the report the same way. purchaseDate is filled only when empty: it
 *  is when the asset first arrived, which warranty and maintenance cycles read, not the date
 *  of the latest delivery.
 *
 *  Runs for consumables too, though their remaining stock is valued off Lot.unitCost. Most
 *  consumables have no lots at all (see AGENTS.md) and a เบิกใช้ line often carries no lotId,
 *  so without a price on the item those units can never be valued — 178 of 194 consumables
 *  had a priced receipt while every one of them read purchasePrice = null. It is the fallback
 *  ราคาต่อหน่วย for anything the lot cannot answer, never a second source for what the lots
 *  already price.
 *
 *  Writes null when nothing priced is left — deleting the last price on a receipt has to
 *  clear the average, not leave the old one standing as if it were still derived from
 *  something. */
export async function syncItemPurchasePrice(tx: TxClient, itemId: string, firstReceivedAt?: Date) {
  const priced = await tx.receiveRecord.findMany({
    where: { itemId, unitCost: { not: null } },
    select: { quantity: true, unitCost: true },
  });
  const avg = weightedUnitCost(priced);
  const item = await tx.item.findUnique({ where: { id: itemId }, select: { purchaseDate: true } });
  await tx.item.update({
    where: { id: itemId },
    data: {
      purchasePrice: avg,
      ...(avg != null && item?.purchaseDate == null && firstReceivedAt
        ? { purchaseDate: firstReceivedAt }
        : {}),
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

/** ราคาที่ใช้ตีมูลค่าของชิ้นที่ตัดจำหน่าย/สูญหาย.
 *
 *  ใบรับเข้าของชิ้นนั้นเองมาก่อนเสมอ (ยอดที่จ่ายจริง) แล้วค่อยตกไปที่ราคาเฉลี่ยของรายการ.
 *  `exact` is what the screen and the export column read to say which of the two a number is —
 *  ตัดจำหน่ายกล้อง 3 ตัวที่ซื้อคนละปีคนละราคา used to write off at one averaged figure, and a
 *  ยอดที่จ่ายจริง that is silently an average is worse than one labelled as an estimate. */
export function writeOffValue(receiptUnitCost: number | null | undefined, itemAvgPrice: number | null | undefined) {
  return receiptUnitCost != null
    ? { value: receiptUnitCost, exact: true }
    : { value: itemAvgPrice ?? null, exact: false };
}

// ── ของที่หายออกจากคลัง — เหตุการณ์ ไม่ใช่สถานะ ──

/**
 * หนึ่งครั้งที่ของหลุดออกจากคลังถาวร: สูญหาย หรือ ตัดจำหน่าย.
 *
 * **นับเหตุการณ์ ไม่ใช่สถานะปัจจุบัน** — ตรงข้ามกับ `stockValueRows` ข้างล่างที่ถามว่า "ตอนนี้ของ
 * ชิ้นไหนอยู่สถานะ LOST/DISPOSED บ้าง" ตลอดกาล. คำถามที่นี่คือ "เดือนไหน/ปีไหนเสียของไปเท่าไร"
 * ซึ่งตอบด้วยสถานะปัจจุบันไม่ได้เลย เพราะสถานะไม่มีวันที่. สองยอดนี้ไม่มีวันเท่ากันและไม่ควรเท่า.
 *
 * ของที่เรียกคืนได้แล้ว (recoveredAt) ไม่นับ — มันกลับมาแล้ว จึงไม่ใช่ของที่เสียไป. เกณฑ์เดียวกับ
 * การ์ดของหายใน /alerts ที่กรองเฉพาะเคสที่ยังเปิด.
 *
 * ที่เดียวสำหรับทั้งกราฟรายเดือนของ มูลค่าคงคลัง และการ์ดรายปีของ ค่าใช้จ่ายรายปี — สองหน้าที่
 * นับคนละ query แล้วให้ตัวเลขไม่ตรงกันคือสิ่งที่หน้ารายงานนี้เคยเป็นมาแล้ว.
 */
export interface LossEvent {
  at: Date;
  kind: "LOST" | "DISPOSED";
  itemId: string;
  itemCode: string;
  itemName: string;
  unitName: string;
  /** พัสดุที่ยังไม่ได้ผูก profile ตกเป็น "ไม่ใช่สิ้นเปลือง" เกณฑ์เดียวกับ stockValueRows */
  isConsumable: boolean;
  qty: number;
  /** null = ตีราคาไม่ได้เลย (ไม่มีทั้งใบรับเข้าและราคาเฉลี่ย) */
  value: number | null;
  /** true = ราคาจากใบรับเข้าของชิ้นนั้นเอง, false = ตีจากราคาเฉลี่ยของรายการ (แสดง ≈) */
  exact: boolean;
}

export async function lossEvents(
  db: Pick<TxClient, "itemStatusLog" | "stockAdjustment">,
  range?: { gte: Date; lte: Date },
  item?: Prisma.ItemWhereInput,
): Promise<LossEvent[]> {
  const itemWhere = item ? { item } : {};
  const [logs, adjustments] = await Promise.all([
    db.itemStatusLog.findMany({
      where: {
        newStatus: { in: [ItemStatus.LOST, ItemStatus.DISPOSED] },
        recoveredAt: null,
        ...(range ? { changedAt: range } : {}),
        ...itemWhere,
      },
      select: {
        changedAt: true, newStatus: true, qty: true,
        item: { select: { id: true, code: true, name: true, purchasePrice: true, issueUnit: { select: { name: true } }, category: { select: { profile: { select: { dispenseType: true } } } } } },
        subItem: { select: { receiveRecord: { select: { unitCost: true } } } },
      },
    }),
    db.stockAdjustment.findMany({
      where: {
        reason: { in: [AdjustmentReason.LOST, AdjustmentReason.DISPOSAL] },
        recoveredAt: null,
        ...(range ? { adjustedAt: range } : {}),
        ...itemWhere,
      },
      select: {
        adjustedAt: true, reason: true, previousQty: true, newQty: true,
        item: { select: { id: true, code: true, name: true, purchasePrice: true, issueUnit: { select: { name: true } }, category: { select: { profile: { select: { dispenseType: true } } } } } },
      },
    }),
  ]);

  const events: LossEvent[] = [];

  for (const l of logs) {
    // qty เป็น null บนทุกแถวที่เป็นการเปลี่ยนสถานะของชิ้นเดียว — ดูคอมเมนต์ที่ schema
    const qty = l.qty ?? 1;
    const { value, exact } = writeOffValue(l.subItem?.receiveRecord?.unitCost, l.item.purchasePrice);
    events.push({
      at: l.changedAt,
      kind: l.newStatus === ItemStatus.LOST ? "LOST" : "DISPOSED",
      itemId: l.item.id,
      itemCode: l.item.code,
      itemName: l.item.name,
      unitName: l.item.issueUnit.name,
      isConsumable: l.item.category.profile?.dispenseType === "CONSUMABLE",
      qty,
      value: value == null ? null : value * qty,
      exact,
    });
  }

  for (const a of adjustments) {
    // ยอดที่หายไป = ที่ลดลงจริง. แถวที่ยอดไม่ลด (แก้ข้อมูลกลับ) ไม่ใช่ของที่เสียไป
    const qty = a.previousQty - a.newQty;
    if (qty <= 0) continue;
    // ยอดนับจำนวนไม่มีใบรับเข้าของตัวเอง — ราคาเฉลี่ยของรายการคือคำตอบเดียวที่มี จึงไม่มีทาง exact
    const { value, exact } = writeOffValue(null, a.item.purchasePrice);
    events.push({
      at: a.adjustedAt,
      kind: a.reason === AdjustmentReason.LOST ? "LOST" : "DISPOSED",
      itemId: a.item.id,
      itemCode: a.item.code,
      itemName: a.item.name,
      unitName: a.item.issueUnit.name,
      isConsumable: a.item.category.profile?.dispenseType === "CONSUMABLE",
      qty,
      value: value == null ? null : value * qty,
      exact,
    });
  }

  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** ยอดรวมของกอง LossEvent — การ์ดทุกใบที่พูดถึงของหายอ่านผ่านตัวนี้ตัวเดียว. */
export function summariseLosses(events: LossEvent[]) {
  const priced = events.filter((e) => e.value != null);
  return {
    qty: events.reduce((s, e) => s + e.qty, 0),
    /** จำนวนหน่วยที่ตีราคาไม่ได้เลย จึงไม่อยู่ใน value — ตัวหารที่บอกว่ายอดครอบคลุมแค่ไหน */
    unpricedQty: events.filter((e) => e.value == null).reduce((s, e) => s + e.qty, 0),
    value: priced.reduce((s, e) => s + (e.value ?? 0), 0),
    /**
     * false = มีอย่างน้อยหนึ่งหน่วยที่ตีจากราคาเฉลี่ย ไม่ใช่ยอดที่จ่ายจริง (แสดง ≈)
     *
     * กองที่ตีราคาไม่ได้เลยต้องเป็น false ด้วย ไม่ใช่ true: `[].every()` คืน true ตามนิยาม
     * ("ไม่มีตัวไหนไม่แม่น") ซึ่งทำให้ปีที่ของหายไปโดยไม่มีราคาสักชิ้น ขึ้นการ์ดว่า "มูลค่า ฿0"
     * เฉยๆ ไม่มี ≈ — คนอ่านเพื่อตั้งงบแยกไม่ออกว่านั่นคือ "ยืนยันว่าไม่เสียมูลค่า" หรือ
     * "เสียของไปแต่ไม่รู้ราคา" ซึ่งเป็นคนละเรื่องกันคนละงบกัน. ยอด 0 ที่มาจากของ 0 ชิ้นยังเป็น
     * true ตามเดิม — ไม่มีอะไรให้ประมาณ.
     */
    exact: priced.length > 0 ? priced.every((e) => e.exact) : events.length === 0,
    events: events.length,
  };
}

// ── มูลค่าคงคลัง — one valuation, read by both the tab and its export ──

/**
 * สถานะที่แปลว่าของหายไปจากคลังถาวร. ชำรุด (DAMAGED) ไม่อยู่ในนี้: ของที่ยังพังอยู่ยังไม่ได้เสียไป
 * ไหน ซ่อมเสร็จก็กลับมา.
 *
 * **ไม่ใช่เกณฑ์เดียวกับการ์ด "มูลค่าของที่ยังหาไม่พบ"** ในหน้า /alerts — คอมเมนต์เดิมตรงนี้เขียนว่า
 * เหมือนกัน ซึ่งผิด และเป็นคนละคำถามกันตั้งแต่ต้น:
 *   - ที่นี่นับ **สถานะปัจจุบัน** ของชิ้น (LOST + DISPOSED) ตลอดกาล ของที่เรียกคืนได้แล้วหลุดออกเอง
 *   - การ์ดนั้นนับ **ใบเคส** ที่ยังเปิดอยู่ (itemStatusLog + stockAdjustment) ตามช่วงเวลาที่กรอง
 *     และไม่รวม DISPOSED เพราะตัดจำหน่ายไม่ใช่ของหาย
 *   - ฝั่งสิ้นเปลืองข้างล่างไม่ได้นับ LOST เลย: `usedQty` มาจาก dispenseRecords คือของที่เบิกใช้ไป
 *     ซึ่งเป็นปลายทางปกติของมัน ไม่ใช่ความเสียหาย — คอลัมน์จึงชื่อ "มูลค่าที่ใช้ไป" คนละคำกับ
 *     "มูลค่าที่เสียไป" ของฝั่งคงทน
 * สองยอดนี้ไม่มีวันเท่ากันและไม่ควรเท่า อย่าเอามาเช็คกันเอง.
 */
const WRITTEN_OFF: ItemStatus[] = [ItemStatus.DISPOSED, ItemStatus.LOST];

export interface StockValueRow {
  id: string;
  code: string;
  name: string;
  categoryName: string;
  profileName: string;
  dispenseType: string;
  totalQty: number;
  availableQty: number;
  unitName: string;
  /** ราคาต่อหน่วยที่ใช้ตีของที่ยังเหลือ */
  unitCost: number | null;
  /** มูลค่าของที่ยังเหลือ */
  value: number;
  /** ของที่ไม่อยู่ในคลังแล้ว — สิ้นเปลืองคือ "เบิกไปใช้", คงทนคือ "ตัดจำหน่าย/สูญหาย" */
  usedQty: number;
  usedValue: number;
  /** ทุกหน่วยใน usedValue รู้ราคาจริง — false คือมีบางส่วนตีจากราคาเฉลี่ย (แสดง ≈) */
  usedExact: boolean;
  /** จำนวนหน่วยใน usedQty ที่ไม่มีราคาเลย จึงไม่ได้อยู่ใน usedValue */
  usedUnpricedQty: number;
}

/** ตีมูลค่าคลังทั้งใบ — ของที่เหลือ และของที่ออกไปแล้ว.
 *
 *  อยู่ที่เดียวเพราะหน้าจอกับไฟล์ export เคยคำนวณคนละก๊อปปี้ แก้ที่หนึ่งแล้วอีกที่ไม่ตาม.
 *
 *  ของที่เหลือ: สิ้นเปลืองตีจาก Lot.unitCost ตามล็อตที่ยังมีของ ตกไปที่ Item.purchasePrice
 *  เมื่อไม่มีล็อต (ของสิ้นเปลืองส่วนใหญ่ไม่มีล็อต — ดู AGENTS.md) ส่วนคงทนตี Item.purchasePrice
 *  คูณจำนวนที่พร้อมใช้.
 *
 *  ของที่ออกไปแล้ว: สิ้นเปลืองนับจากใบเบิกที่ยังไม่ได้คืน (quantity − resolvedQty) ตีราคาตาม
 *  ล็อตที่เบิกออกไปจริง ตกไปที่ราคาเฉลี่ยของรายการ. คงทนนับรายชิ้นที่ตัดจำหน่าย/สูญหาย ตีจาก
 *  ใบรับเข้าที่พามันเข้าคลัง ตกไปที่ราคาเฉลี่ยเหมือนกัน (writeOffValue).
 *
 *  ของคงทนแบบนับจำนวน (COUNT) ไม่มีรายชิ้นให้นับ usedQty จึงเป็น 0 เสมอ — การตัดจำหน่ายของ
 *  พวกนี้ไปอยู่ที่ stock_adjustments ซึ่งยังไม่มีใครใช้บันทึกการตัดจำหน่ายจริงสักรายการ. */
export async function stockValueRows(
  db: { item: TxClient["item"] },
  where: Prisma.ItemWhereInput,
): Promise<StockValueRow[]> {
  const items = await db.item.findMany({
    where,
    include: {
      lots: { select: { remainingQty: true, unitCost: true } },
      category: { include: { profile: { select: { name: true, dispenseType: true } } } },
      issueUnit: { select: { name: true } },
      dispenseRecords: {
        select: { quantity: true, resolvedQty: true, lot: { select: { unitCost: true } } },
      },
      subItems: {
        where: { status: { in: WRITTEN_OFF } },
        select: { receiveRecord: { select: { unitCost: true } } },
      },
    },
    orderBy: { code: "asc" },
  });

  return items.map((it) => {
    const isConsumable = it.category.profile?.dispenseType === "CONSUMABLE";
    const avg = it.purchasePrice ?? null;

    let unitCost: number | null = null;
    let value = 0;
    let usedQty = 0;
    let usedValue = 0;
    let usedUnpricedQty = 0;
    let usedExact = true;

    if (isConsumable) {
      let totalRemaining = 0;
      let lotValue = 0;
      for (const lot of it.lots) {
        totalRemaining += lot.remainingQty;
        lotValue += lot.remainingQty * (lot.unitCost ?? 0);
      }
      if (totalRemaining > 0 && lotValue > 0) {
        unitCost = lotValue / totalRemaining;
        value = lotValue;
      } else {
        // ไม่มีล็อต หรือมีแต่ยังไม่มีใครกรอกราคาล็อต — ราคาเฉลี่ยของรายการคือคำตอบเดียวที่เหลือ
        unitCost = avg;
        value = it.availableQty * (avg ?? 0);
      }

      for (const d of it.dispenseRecords) {
        const qty = d.quantity - d.resolvedQty;
        if (qty <= 0) continue;
        usedQty += qty;
        const price = d.lot?.unitCost ?? avg;
        if (price == null) {
          usedUnpricedQty += qty;
          usedExact = false;
        } else {
          usedValue += qty * price;
          if (d.lot?.unitCost == null) usedExact = false;
        }
      }
    } else {
      unitCost = avg;
      value = it.availableQty * (avg ?? 0);

      for (const s of it.subItems) {
        usedQty += 1;
        const price = writeOffValue(s.receiveRecord?.unitCost, avg);
        if (price.value == null) {
          usedUnpricedQty += 1;
          usedExact = false;
        } else {
          usedValue += price.value;
          if (!price.exact) usedExact = false;
        }
      }
    }

    return {
      id: it.id,
      code: it.code,
      name: it.name,
      categoryName: it.category.name,
      profileName: it.category.profile?.name ?? "—",
      dispenseType: it.category.profile?.dispenseType ?? "—",
      totalQty: it.totalQty,
      availableQty: it.availableQty,
      unitName: it.issueUnit.name,
      unitCost,
      value,
      usedQty,
      usedValue,
      usedExact,
      usedUnpricedQty,
    };
  });
}
