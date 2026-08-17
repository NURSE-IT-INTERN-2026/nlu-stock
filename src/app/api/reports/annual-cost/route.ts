import { prisma } from "@/lib/prisma";
import { requireAuth, json, getSearchParams } from "@/lib/api-utils";
import { NextRequest } from "next/server";

/**
 * ค่าใช้จ่ายรายปี — ปีปฏิทิน (ม.ค.–ธ.ค.); the client labels it พ.ศ.
 *
 * Purchases come from two places because the schema records them in two places:
 *   ครุภัณฑ์ / วัสดุคงทน → Item.purchasePrice, dated by Item.purchaseDate
 *   วัสดุสิ้นเปลือง       → Lot.unitCost × Lot.receivedQty, dated by Lot.receivedDate
 * This route used to read only the first, so every baht spent on consumables was missing
 * from the year's spend — and consumables are the only thing the รับเข้า screen currently
 * collects a price for.
 *
 * Known limitation: Item carries ONE purchasePrice and ONE purchaseDate, so a durable bought
 * in several batches counts only against the year of that single date. Fixing it needs a
 * per-receipt price on durables, not a change here.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth.denied) return auth.denied;

  const params = getSearchParams(request);
  const year = Number(params.get("year") || new Date().getFullYear());
  const categoryId = params.get("categoryId") || undefined;

  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year, 11, 31, 23, 59, 59);

  const itemWhere: Record<string, unknown> = {
    purchaseDate: { gte: startOfYear, lte: endOfYear },
    isActive: true,
    purchasePrice: { not: null },
  };
  if (categoryId) itemWhere.categoryId = categoryId;

  const lotWhere: Record<string, unknown> = {
    receivedDate: { gte: startOfYear, lte: endOfYear },
    unitCost: { not: null },
    item: { isActive: true, ...(categoryId ? { categoryId } : {}) },
  };

  const maintWhere: Record<string, unknown> = {
    performedAt: { gte: startOfYear, lte: endOfYear },
    cost: { not: null },
  };
  if (categoryId) maintWhere.item = { categoryId };

  // ปีที่ยังไม่มีใครกรอกราคาเลยกับปีที่ไม่ได้ซื้ออะไรเลยให้ยอด 0 เท่ากัน — ตัวนับนี้คือสิ่งเดียว
  // ที่แยกสองอย่างนั้นออกจากกัน และบอกด้วยว่าต้องตามไปกรอกอีกกี่รายการ.
  const unpricedItemWhere = { ...itemWhere, purchasePrice: null };
  const unpricedLotWhere = { ...lotWhere, unitCost: null };
  const unpricedMaintWhere = { ...maintWhere, cost: null };

  const [items, lots, repairs, unpricedItems, unpricedLots, unpricedRepairs] = await Promise.all([
    prisma.item.findMany({
      where: itemWhere,
      select: {
        id: true,
        code: true,
        name: true,
        purchasePrice: true,
        purchaseDate: true,
        category: { select: { name: true } },
      },
      orderBy: { purchaseDate: "desc" },
    }),
    prisma.lot.findMany({
      where: lotWhere,
      select: {
        id: true,
        lotNumber: true,
        receivedQty: true,
        unitCost: true,
        receivedDate: true,
        item: { select: { code: true, name: true, category: { select: { name: true } } } },
      },
      orderBy: { receivedDate: "desc" },
    }),
    prisma.maintenanceRecord.findMany({
      where: maintWhere,
      include: {
        item: { select: { code: true, name: true, category: { select: { name: true } } } },
        performer: { select: { name: true } },
      },
      orderBy: { performedAt: "desc" },
    }),
    prisma.item.count({ where: unpricedItemWhere }),
    prisma.lot.count({ where: unpricedLotWhere }),
    prisma.maintenanceRecord.count({ where: unpricedMaintWhere }),
  ]);

  // Both purchase sources land in one list with a `kind` column — the reader wants "ซื้ออะไร
  // ไปบ้างปีนี้", not two tables they have to add up themselves.
  const purchaseData = [
    ...items.map((p) => ({
      id: p.id,
      kind: "DURABLE" as const,
      code: p.code,
      name: p.name,
      categoryName: p.category.name,
      detail: "",
      quantity: 1,
      amount: p.purchasePrice ?? 0,
      date: p.purchaseDate!.toISOString(),
    })),
    ...lots.map((l) => ({
      id: l.id,
      kind: "CONSUMABLE" as const,
      code: l.item.code,
      name: l.item.name,
      categoryName: l.item.category.name,
      detail: l.lotNumber,
      quantity: l.receivedQty,
      amount: l.receivedQty * (l.unitCost ?? 0),
      date: l.receivedDate.toISOString(),
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

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

  // Group by category for chart
  const categoryMap = new Map<string, { totalPurchase: number; totalRepair: number }>();
  for (const p of purchaseData) {
    const entry = categoryMap.get(p.categoryName) ?? { totalPurchase: 0, totalRepair: 0 };
    entry.totalPurchase += p.amount;
    categoryMap.set(p.categoryName, entry);
  }
  for (const r of repairData) {
    const entry = categoryMap.get(r.categoryName) ?? { totalPurchase: 0, totalRepair: 0 };
    entry.totalRepair += r.cost;
    categoryMap.set(r.categoryName, entry);
  }

  const byCategory = Array.from(categoryMap.entries()).map(([categoryName, vals]) => ({
    categoryName,
    ...vals,
  }));

  return json({
    year,
    purchases: purchaseData,
    repairs: repairData,
    totalPurchase,
    totalRepair,
    byCategory,
    summary: {
      totalPurchase,
      totalRepair,
      durablePurchase: purchaseData.filter((p) => p.kind === "DURABLE").reduce((s, p) => s + p.amount, 0),
      consumablePurchase: purchaseData.filter((p) => p.kind === "CONSUMABLE").reduce((s, p) => s + p.amount, 0),
      purchaseCount: purchaseData.length,
      repairCount: repairData.length,
      unpricedPurchases: unpricedItems + unpricedLots,
      unpricedRepairs,
    },
  });
}
