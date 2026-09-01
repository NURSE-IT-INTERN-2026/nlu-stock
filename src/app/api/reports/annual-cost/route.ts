import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { lossEvents, summariseLosses, type LossEvent } from "@/lib/cost";
import { consumableCostBySubject } from "@/lib/usage-by-subject";
import { kindWhere } from "@/lib/dispense-kind-where";

/**
 * ค่าใช้จ่ายรายปี — ปีปฏิทิน (ม.ค.–ธ.ค.); the client labels it พ.ศ.
 *
 * Purchases are ReceiveRecord rows, one source for every kind of พัสดุ. This used to read
 * Item.purchasePrice for durables and Lot.unitCost for consumables, which meant a durable
 * bought in three batches counted once, against the year of its single purchaseDate — and
 * anything received before a price existed counted never. A receipt carries the price, the
 * quantity and the date of one actual purchase, so the year it lands in is the year it was
 * bought in.
 *
 * Rows with unitCost null are purchases nobody typed a price for; they are counted, not
 * summed, and surface as unpricedPurchases so a 0 that means "no data" reads apart from a
 * 0 that means "bought nothing".
 *
 * **ทั้งหน้าแยกเป็นสองฝั่ง: สิ้นเปลือง กับ อื่นๆ** — ไม่ใช่แค่การ์ดค่าจัดซื้อสองใบ. สองก้อนนี้
 * ตั้งงบคนละก้อน อ่านคนละคำถาม และมีเพียงฝั่งสิ้นเปลืองที่ตอนนี้เก็บราคาจริงตอนรับเข้าได้ครบ —
 * ยอดรวมที่กลบความต่างนั้นไว้อ่านเหมือนสองฝั่งน่าเชื่อถือเท่ากัน. คำว่า "อื่นๆ" ไม่ใช่
 * "คงทน + ครุภัณฑ์" แบบ tab มูลค่าคงคลัง เพราะฝั่งนี้ถือค่าซ่อมแซม/ตรวจบำรุงด้วย ซึ่งเป็น
 * ค่าบริการ ไม่ใช่ตัวครุภัณฑ์.
 */

/** แกนของกราฟรายเดือน — เดือนไทยแบบสั้น เรียง ม.ค.→ธ.ค. ตามปีปฏิทินที่ route นี้ใช้ */
const MONTH_LABELS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** ของสิ้นเปลืองคือของที่ profile บอกว่าสิ้นเปลือง — ที่เหลือทั้งหมด (รวมของที่ยังไม่ผูก profile)
 *  คือ "อื่นๆ". NOT ไม่ใช่ `not:` ด้วยเหตุผลเดียวกับที่ stock-balance ใช้: `not` ตัดแถวที่
 *  profile เป็น null ทิ้ง ทั้งที่มันต้องอยู่ฝั่งอื่นๆ */
const IS_CONSUMABLE: Prisma.ItemWhereInput = {
  category: { profile: { dispenseType: "CONSUMABLE" } },
};

type Side = "consumable" | "other";
const sideOf = (isConsumable: boolean): Side => (isConsumable ? "consumable" : "other");

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const year = Number(params.get("year") || new Date().getFullYear());
  const categoryId = params.get("categoryId") || undefined;
  // ปุ่มหมวดหมู่เป็น cascade: หยุดที่ชั้นประเภทก็กรองได้ — หมวดย่อยชนะประเภทเมื่อเลือกทั้งคู่
  const profileId = params.get("profileId") || undefined;
  const catWhere: Prisma.ItemWhereInput | undefined =
    categoryId ? { categoryId } : profileId ? { category: { profileId } } : undefined;

  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year, 11, 31, 23, 59, 59);
  const inYear = { gte: startOfYear, lte: endOfYear };

  const receiveWhere: Prisma.ReceiveRecordWhereInput = {
    receivedAt: inYear,
    item: { isActive: true, ...(catWhere ?? {}) },
  };

  const maintWhere: Prisma.MaintenanceRecordWhereInput = {
    performedAt: inYear,
    cost: { not: null },
    ...(catWhere ? { item: catWhere } : {}),
  };

  // ปีที่ยังไม่มีใครกรอกราคาเลยกับปีที่ไม่ได้ซื้ออะไรเลยให้ยอด 0 เท่ากัน — ตัวนับนี้คือสิ่งเดียว
  // ที่แยกสองอย่างนั้นออกจากกัน และบอกด้วยว่าต้องตามไปกรอกอีกกี่รายการ. นับแยกสองฝั่ง เพราะ
  // ฝั่งครุภัณฑ์คือฝั่งที่ยังกรอกราคาไม่ได้ที่หน้ารับเข้า — ตัวเลขรวมกลบข้อเท็จจริงนั้น.
  // AND: `receiveWhere.item` ถือ isActive/categoryId ของตัวเองอยู่แล้ว เขียนทับจะลบทิ้งเงียบๆ
  const unpricedOn = (side: Side) =>
    prisma.receiveRecord.count({
      where: {
        ...receiveWhere,
        unitCost: null,
        item: { AND: [receiveWhere.item!, side === "consumable" ? IS_CONSUMABLE : { NOT: IS_CONSUMABLE }] },
      },
    });

  const itemWhere = catWhere;

  // ต้นทุนของที่ถูกใช้ไปแยกรายวิชา — เฉพาะ "เบิกใช้" ตามนิยามเดียวกับ tab สถิติการใช้งาน
  // (kindWhere ตัวเดียวกัน) ไม่ใช่ predicate ที่เขียนใหม่ตรงนี้ ไม่งั้นสองหน้าจะนับคนละชุด.
  // AND ไม่ใช่ spread: kindWhere ถือคีย์ item ของตัวเองอยู่แล้ว
  const subjectWhere = {
    AND: [
      kindWhere("consume"),
      ...(itemWhere ? [{ item: itemWhere }] : []),
      { dispensedAt: inYear },
    ],
  };

  const [
    receipts, repairs, losses, bySubject,
    unpricedConsumable, unpricedOther, unpricedRepairs,
  ] = await Promise.all([
    prisma.receiveRecord.findMany({
      where: { ...receiveWhere, unitCost: { not: null } },
      select: {
        id: true,
        quantity: true,
        unitCost: true,
        receivedAt: true,
        lot: { select: { lotNumber: true } },
        item: {
          select: {
            code: true,
            name: true,
            category: { select: { name: true, profile: { select: { dispenseType: true } } } },
          },
        },
      },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.maintenanceRecord.findMany({
      where: maintWhere,
      include: {
        item: {
          select: {
            code: true, name: true,
            category: { select: { name: true, profile: { select: { dispenseType: true } } } },
          },
        },
        performer: { select: { name: true } },
      },
      orderBy: { performedAt: "desc" },
    }),
    // ของที่หายออกจากคลังปีนี้ — คนละเรื่องกับเงินที่จ่ายออกไป จึงไม่เคยรวมกับยอดใดยอดหนึ่ง
    // แต่มันคือความสูญเสียของปีนั้นจริงๆ และเป็นตัวเลขที่คนทำงบต้องเห็น (เกณฑ์เหตุการณ์
    // เดียวกับกราฟรายเดือนของ มูลค่าคงคลัง — lib/cost lossEvents)
    lossEvents(prisma, inYear, itemWhere),
    consumableCostBySubject(subjectWhere),
    unpricedOn("consumable"),
    unpricedOn("other"),
    prisma.maintenanceRecord.count({ where: { ...maintWhere, cost: null } }),
  ]);

  const purchaseData = receipts.map((r) => ({
    id: r.id,
    side: sideOf(r.item.category.profile?.dispenseType === "CONSUMABLE"),
    code: r.item.code,
    name: r.item.name,
    categoryName: r.item.category.name,
    detail: r.lot?.lotNumber ?? "",
    quantity: r.quantity,
    amount: r.quantity * (r.unitCost ?? 0),
    date: r.receivedAt.toISOString(),
  }));

  // **ค่าซ่อมบำรุงเป็นของฝั่งอื่นๆ เสมอ ไม่ว่าพัสดุจะเป็นชนิดไหน.** ของสิ้นเปลืองถูกเบิกออกไปใช้
  // หรือไม่ก็ตัดจำหน่าย — ไม่มีใครส่งสำลีไปซ่อม และฐานข้อมูลก็ยืนยัน (0 จาก 1,025 ใบผูกกับ
  // พัสดุสิ้นเปลือง วัดเมื่อ 2026-08-26). แต่ API ไม่ได้ห้ามไว้ การแยกตามชนิดพัสดุจึงเสี่ยงกว่า:
  // ใบที่หลุดมาจะไปโผล่ฝั่งสิ้นเปลืองที่ไม่มีตารางให้มันแสดง กลายเป็นตัวเลขที่บวกอยู่ในยอดรวม
  // โดยไม่มีแถวไหนอธิบายมันได้. โยนมาฝั่งเดียวแล้วมันยังถูกนับครั้งเดียวและมีที่ให้อ่านเสมอ.
  const repairData = repairs.map((r) => ({
    id: r.id,
    side: "other" as Side,
    itemCode: r.item.code,
    itemName: r.item.name,
    categoryName: r.item.category.name,
    cost: r.cost ?? 0,
    performedAt: r.performedAt.toISOString(),
    type: r.type,
    performer: r.performer.name,
  }));

  /** ทุกตัวเลขของหนึ่งฝั่ง คิดจากแถวชุดเดียวกันทั้งหมด — การ์ด กราฟ ตาราง จึงเถียงกันไม่ได้ */
  function buildSide(side: Side, unpricedPurchases: number) {
    const purchases = purchaseData.filter((p) => p.side === side);
    const sideRepairs = repairData.filter((r) => r.side === side);
    const sideLosses = losses.filter((l: LossEvent) => sideOf(l.isConsumable) === side);

    const corrective = sideRepairs.filter((r) => r.type === "CORRECTIVE");
    const preventive = sideRepairs.filter((r) => r.type !== "CORRECTIVE");

    // ซ่อมแซม (CORRECTIVE) กับ ตรวจบำรุงตามรอบ (PREVENTIVE) เป็นคนละก้อนงบในสายตาคนอ่าน —
    // ก้อนหนึ่งคือเงินที่ต้องจ่ายเพราะของพัง อีกก้อนคือเงินที่ตั้งใจจ่ายเพื่อไม่ให้พัง.
    const byMonth = MONTH_LABELS.map((month) => ({ month, purchase: 0, corrective: 0, preventive: 0 }));
    for (const p of purchases) byMonth[new Date(p.date).getMonth()].purchase += p.amount;
    for (const r of sideRepairs) {
      const bucket = byMonth[new Date(r.performedAt).getMonth()];
      if (r.type === "CORRECTIVE") bucket.corrective += r.cost;
      else bucket.preventive += r.cost;
    }

    const totalPurchase = purchases.reduce((s, p) => s + p.amount, 0);
    const correctiveCost = corrective.reduce((s, r) => s + r.cost, 0);
    const preventiveCost = preventive.reduce((s, r) => s + r.cost, 0);

    return {
      byMonth,
      repairs: sideRepairs,
      loss: summariseLosses(sideLosses),
      summary: {
        totalPurchase,
        purchaseCount: purchases.length,
        unpricedPurchases,
        correctiveCost,
        correctiveCount: corrective.length,
        preventiveCost,
        preventiveCount: preventive.length,
        repairCount: sideRepairs.length,
        // ใบที่ยังไม่กรอกค่าซ่อมทั้งหมดเป็นของฝั่งอื่นๆ ด้วยเหตุผลเดียวกับตัวค่าซ่อมเอง
        unpricedRepairs: side === "other" ? unpricedRepairs : 0,
        // เงินที่จ่ายออกไปจริงของฝั่งนี้ — ไม่รวมของที่หาย ซึ่งเป็นความสูญเสีย ไม่ใช่รายจ่าย
        total: totalPurchase + correctiveCost + preventiveCost,
      },
    };
  }

  return json({
    year,
    // ตารางรายวิชาเป็นของฝั่งสิ้นเปลืองโดยกำเนิด — ยืมแล้วคืนไม่ใช่ต้นทุน และครุภัณฑ์ไม่ถูกเบิกใช้
    bySubject,
    sides: {
      consumable: buildSide("consumable", unpricedConsumable),
      other: buildSide("other", unpricedOther),
    },
  });
}
