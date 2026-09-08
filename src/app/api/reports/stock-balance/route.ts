import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { stockValueRows, lossEvents } from "@/lib/cost";
import { monthKey, monthRange } from "@/lib/format";
import { NextRequest } from "next/server";
import type { Prisma } from "@/generated/prisma/client";

/** หนึ่งเดือนบนกราฟ "ของที่ออกจากคลัง" — สองฝั่งของหน้าใช้รูปเดียวกัน คนละที่มา. */
type OutflowMonth = {
  month: string;
  qty: number;
  value: number;
  /** หน่วยที่ตีราคาไม่ได้เลย จึงไม่อยู่ใน value — กราฟบอกไม่ได้ แต่บรรทัดใต้กราฟบอกได้ */
  unpricedQty: number;
};

/** ยัดยอดลงถังของเดือนนั้น แล้วเติมเดือนที่ว่างให้เป็นศูนย์ — ช่องโหว่บนแกนเวลาอ่านเป็น
 *  "ยังไม่มีข้อมูล" ทั้งที่แปลว่า "เดือนนั้นไม่มีของออก". */
function fillMonths(buckets: Map<string, OutflowMonth>): OutflowMonth[] {
  if (buckets.size === 0) return [];
  const keys = [...buckets.keys()].sort();
  return monthRange(keys[0], keys[keys.length - 1]).map(
    (month) => buckets.get(month) ?? { month, qty: 0, value: 0, unpricedQty: 0 },
  );
}

function bucket(map: Map<string, OutflowMonth>, at: Date): OutflowMonth {
  const month = monthKey(at);
  const entry = map.get(month) ?? { month, qty: 0, value: 0, unpricedQty: 0 };
  map.set(month, entry);
  return entry;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const categoryId = params.get("categoryId") || undefined;
  const profileId = params.get("profileId") || undefined;

  // สองตัวกรอง เพราะตารางกับกราฟตอบคนละคำถาม.
  //   pastWhere — หมวดหมู่อย่างเดียว. กราฟเล่าว่าปีก่อนๆ เกิดอะไรขึ้น และการลบรายการพัสดุ
  //     คือการตัดจำหน่าย (api/settings/items/[id] เขียน StockAdjustment DISPOSAL แล้วปิด
  //     isActive ใน transaction เดียว) — กรอง isActive ตรงนี้จะลบการตัดจำหน่ายทุกใบที่มาจาก
  //     การลบรายการออกจากกราฟ ทั้งที่มันคือแท่งที่คนเปิดกราฟมาหา.
  //   where — บวก isActive. ตารางบอกว่า "ตอนนี้คลังมีของมูลค่าเท่าไร" ของที่ลบไปแล้วไม่ได้อยู่
  //     ในคลัง จึงไม่ควรมีมูลค่า.
  const pastWhere: Prisma.ItemWhereInput = {};
  if (categoryId) pastWhere.categoryId = categoryId;
  else if (profileId) pastWhere.category = { profileId };
  const where: Prisma.ItemWhereInput = { isActive: true, ...pastWhere };

  // ทั้งแถวและวิธีตีราคามาจาก lib/cost — ไฟล์ export ใช้ตัวเดียวกัน จึงไม่มีทางให้ตัวเลข
  // บนจอกับในไฟล์เถียงกัน. summary ที่นี่เป็นยอดรวมทั้งคลัง; หน้าจอแยกสิ้นเปลือง/คงทน
  // แล้วพับเองจากแถวที่กรองไว้.
  //
  // การ์ดสองใบบนหน้าจอตอบว่า "รวมทั้งหมดเท่าไร" แต่ตอบไม่ได้ว่า "เดือนไหนหนัก" ซึ่งเป็นคำถาม
  // ที่คนดูงบถามจริง — สองชุดล่างจึงเป็นแกนเวลาของสิ่งเดียวกันกับที่การ์ดสรุปไว้:
  //   สิ้นเปลือง = ของที่เบิกไปใช้ (ปลายทางปกติ ไม่ใช่ความเสียหาย)
  //   คงทน      = ของที่สูญหาย/ตัดจำหน่าย (ของที่เสียไปจริง)
  // ทั้งคู่ไม่กรองปี — ตัวกรองของ tab นี้เป็นหมวดหมู่อย่างเดียว มูลค่าคงคลังคือภาพรวมทั้งคลัง
  const [rows, consumed, losses] = await Promise.all([
    stockValueRows(prisma, where),
    prisma.dispenseRecord.findMany({
      // AND ไม่ใช่ spread: `where` ถือคีย์ category ของตัวเองอยู่เมื่อกรองด้วยประเภทพัสดุ
      // การเขียนทับจะลบตัวกรองนั้นทิ้งเงียบๆ
      where: {
        item: { AND: [pastWhere, { category: { profile: { dispenseType: "CONSUMABLE" } } }] },
      },
      select: {
        dispensedAt: true, quantity: true, resolvedQty: true,
        lot: { select: { unitCost: true } },
        item: { select: { purchasePrice: true } },
      },
    }),
    // NOT ไม่ใช่ `dispenseType: { not: "CONSUMABLE" }`: พัสดุที่ยังไม่ได้ผูก profile มี profile
    // เป็น null ซึ่ง `not` จะตัดทิ้ง แต่ตารางฝั่งคงทนนับมันอยู่ (stockValueRows อ่าน
    // `profile?.dispenseType === "CONSUMABLE"` แล้วตกเป็นคงทน) — กราฟกับตารางต้องนับชุดเดียวกัน
    lossEvents(prisma, undefined, {
      AND: [pastWhere, { NOT: { category: { profile: { dispenseType: "CONSUMABLE" } } } }],
    }),
  ]);

  const consumableMonths = new Map<string, OutflowMonth>();
  for (const d of consumed) {
    // เกณฑ์เดียวกับ stockValueRows: ของที่ออกไปแล้วยังไม่กลับ ไม่ใช่ทุกใบที่เคยเบิก
    const qty = d.quantity - d.resolvedQty;
    if (qty <= 0) continue;
    const price = d.lot?.unitCost ?? d.item.purchasePrice;
    const entry = bucket(consumableMonths, d.dispensedAt);
    entry.qty += qty;
    if (price == null) entry.unpricedQty += qty;
    else entry.value += qty * price;
  }

  const durableMonths = new Map<string, OutflowMonth>();
  for (const e of losses) {
    const entry = bucket(durableMonths, e.at);
    entry.qty += e.qty;
    if (e.value == null) entry.unpricedQty += e.qty;
    else entry.value += e.value;
  }

  const summary = {
    totalValue: rows.reduce((s, r) => s + r.value, 0),
    totalAvailableItems: rows.filter((r) => r.availableQty > 0).length,
    itemsWithoutCost: rows.filter((r) => r.unitCost === null).length,
  };

  return json({
    rows,
    summary,
    byMonth: {
      consumable: fillMonths(consumableMonths),
      durable: fillMonths(durableMonths),
    },
  });
}
