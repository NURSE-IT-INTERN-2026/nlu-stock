import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleError, json } from "@/lib/api-utils";
import { syncItemPurchasePrice, syncLotUnitCost } from "@/lib/cost";

/**
 * แก้ราคาต่อหน่วยของใบรับเข้าย้อนหลัง.
 *
 * ค่าใช้จ่ายรายปี and มูลค่าคงคลัง both read prices that only /receive ever collected, and it
 * collected them for consumables alone until now — so most of the history has no price at all
 * (1,337 receipts across 2025–26 at the time this was written). Without a way to fill them in
 * afterwards the reports stay near-zero until every one of those purchases happens again.
 *
 * Only unitCost is editable. Quantity, item and date are what actually moved through the
 * storeroom; correcting those is a stock adjustment, not an edit of the record of what
 * happened. A price is the one field that can be wrong on paper and right in the world.
 */
const patchSchema = z.object({
  // null = ลบราคาออก (ไม่ทราบราคา) — ต่างจาก 0 ที่แปลว่าได้มาฟรี
  unitCost: z.number().min(0).nullable(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.receiveRecord.findUnique({
        where: { id },
        select: {
          id: true, itemId: true, lotId: true, receivedAt: true,
          item: { select: { category: { select: { profile: { select: { dispenseType: true } } } } } },
        },
      });
      if (!record) throw new Error("ไม่พบรายการรับเข้า");

      const row = await tx.receiveRecord.update({
        where: { id },
        data: { unitCost: parsed.data.unitCost },
        select: { id: true, unitCost: true },
      });

      // เหมือน POST เป๊ะ: ราคาอยู่ที่ใบรับเข้า ส่วน Item.purchasePrice / Lot.unitCost เป็นค่าที่
      // derive จากใบรับเข้าทั้งหมดของมัน — แก้ใบไหนก็ตาม ตัวเลขในรายงานตามทันทีโดยไม่ต้อง backfill.
      if (record.item.category.profile?.dispenseType === "CONSUMABLE" && record.lotId) {
        await syncLotUnitCost(tx, record.lotId);
      }
      await syncItemPurchasePrice(tx, record.itemId, record.receivedAt);

      return row;
    });

    return json(updated);
  } catch (err) {
    return handleError(err, "แก้ราคาไม่สำเร็จ");
  }
}
