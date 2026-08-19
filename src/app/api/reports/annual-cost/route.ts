import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";

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
 */

/** แกนของกราฟรายเดือน — เดือนไทยแบบสั้น เรียง ม.ค.→ธ.ค. ตามปีปฏิทินที่ route นี้ใช้ */
const MONTH_LABELS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const year = Number(params.get("year") || new Date().getFullYear());
  const categoryId = params.get("categoryId") || undefined;

  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year, 11, 31, 23, 59, 59);

  const receiveWhere: Prisma.ReceiveRecordWhereInput = {
    receivedAt: { gte: startOfYear, lte: endOfYear },
    item: { isActive: true, ...(categoryId ? { categoryId } : {}) },
  };

  const maintWhere: Record<string, unknown> = {
    performedAt: { gte: startOfYear, lte: endOfYear },
    cost: { not: null },
  };
  if (categoryId) maintWhere.item = { categoryId };

  // ปีที่ยังไม่มีใครกรอกราคาเลยกับปีที่ไม่ได้ซื้ออะไรเลยให้ยอด 0 เท่ากัน — ตัวนับนี้คือสิ่งเดียว
  // ที่แยกสองอย่างนั้นออกจากกัน และบอกด้วยว่าต้องตามไปกรอกอีกกี่รายการ.
  const unpricedMaintWhere = { ...maintWhere, cost: null };

  const [receipts, repairs, unpricedPurchases, unpricedRepairs] = await Promise.all([
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
        item: { select: { code: true, name: true, category: { select: { name: true } } } },
        performer: { select: { name: true } },
      },
      orderBy: { performedAt: "desc" },
    }),
    prisma.receiveRecord.count({ where: { ...receiveWhere, unitCost: null } }),
    prisma.maintenanceRecord.count({ where: unpricedMaintWhere }),
  ]);

  // สิ้นเปลือง vs คงทน ยังแยกกันในตาราง เพราะคนอ่านคิดเป็นสองก้อนงบ — แต่ตอนนี้มาจากแถวชนิด
  // เดียวกัน ไม่ใช่สองตารางที่บวกกันเองไม่ได้.
  const purchaseData = receipts.map((r) => ({
    id: r.id,
    kind: r.item.category.profile?.dispenseType === "CONSUMABLE" ? ("CONSUMABLE" as const) : ("DURABLE" as const),
    code: r.item.code,
    name: r.item.name,
    categoryName: r.item.category.name,
    detail: r.lot?.lotNumber ?? "",
    quantity: r.quantity,
    amount: r.quantity * (r.unitCost ?? 0),
    date: r.receivedAt.toISOString(),
  }));

  const repairData = repairs.map((r) => ({
    id: r.id,
    itemCode: r.item.code,
    itemName: r.item.name,
    categoryName: r.item.category.name,
    cost: r.cost ?? 0,
    performedAt: r.performedAt.toISOString(),
    type: r.type,
    performer: r.performer.name,
  }));

  const totalPurchase = purchaseData.reduce((s, p) => s + p.amount, 0);
  const totalRepair = repairData.reduce((s, r) => s + r.cost, 0);

  // ซ่อมแซม (CORRECTIVE) กับ ตรวจบำรุงตามรอบ (PREVENTIVE) เป็นคนละก้อนงบในสายตาคนอ่าน —
  // ก้อนหนึ่งคือเงินที่ต้องจ่ายเพราะของพัง อีกก้อนคือเงินที่ตั้งใจจ่ายเพื่อไม่ให้พัง. รวมเป็น
  // "ค่าซ่อมบำรุง" ก้อนเดียวแบบเดิมทำให้ดูไม่ออกว่าปีนี้คลังกำลังตามแก้ปัญหาหรือดูแลเชิงป้องกัน.
  const byMonth = MONTH_LABELS.map((month) => ({ month, purchase: 0, corrective: 0, preventive: 0 }));
  for (const p of purchaseData) byMonth[new Date(p.date).getMonth()].purchase += p.amount;
  for (const r of repairData) {
    const bucket = byMonth[new Date(r.performedAt).getMonth()];
    if (r.type === "CORRECTIVE") bucket.corrective += r.cost;
    else bucket.preventive += r.cost;
  }

  const correctiveRepairs = repairData.filter((r) => r.type === "CORRECTIVE");
  const preventiveRepairs = repairData.filter((r) => r.type !== "CORRECTIVE");

  return json({
    year,
    purchases: purchaseData,
    repairs: repairData,
    totalPurchase,
    totalRepair,
    byMonth,
    summary: {
      totalPurchase,
      totalRepair,
      durablePurchase: purchaseData.filter((p) => p.kind === "DURABLE").reduce((s, p) => s + p.amount, 0),
      consumablePurchase: purchaseData.filter((p) => p.kind === "CONSUMABLE").reduce((s, p) => s + p.amount, 0),
      purchaseCount: purchaseData.length,
      repairCount: repairData.length,
      correctiveCost: correctiveRepairs.reduce((s, r) => s + r.cost, 0),
      correctiveCount: correctiveRepairs.length,
      preventiveCost: preventiveRepairs.reduce((s, r) => s + r.cost, 0),
      preventiveCount: preventiveRepairs.length,
      unpricedPurchases,
      unpricedRepairs,
    },
  });
}
