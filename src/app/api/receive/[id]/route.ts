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
 * Only unitCost and the lot's number are editable. Quantity, item and date are what actually
 * moved through the storeroom; correcting those is a stock adjustment, not an edit of the record
 * of what happened. Those two are the fields that can be wrong on paper and right in the world.
 *
 * lotNumber renames the Lot this receipt points at — it does NOT move stock to another lot.
 * The lot is the batch; its number is a property of the batch, so a rename relabels every
 * receipt sharing it. Creating a lot for a receipt that has none is deliberately not offered:
 * on a lot-less consumable that would flip availableQty to SUM(lots) (ADR-0002) and on a
 * durable a lot means nothing.
 */
const patchSchema = z
  .object({
    // null = ลบราคาออก (ไม่ทราบราคา) — ต่างจาก 0 ที่แปลว่าได้มาฟรี. undefined = ไม่ได้แตะช่องนี้
    unitCost: z.number().min(0).nullable().optional(),
    // ล็อตต้องมีเลขเสมอ — ลบเลขล็อตทิ้งคือการลบล็อต ซึ่งเป็นการย้ายของ ไม่ใช่การแก้ป้าย
    lotNumber: z.string().trim().min(1).optional(),
    // ป้ายงวดของใบที่ไม่มีล็อต — ว่างได้ (null = กลับไปใช้รหัสจากวันที่รับเข้า)
    batchRef: z.string().trim().max(100).nullable().optional(),
  })
  .refine((d) => d.unitCost !== undefined || d.lotNumber !== undefined || d.batchRef !== undefined, {
    message: "ไม่มีอะไรให้แก้",
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
          id: true, itemId: true, lotId: true, receivedAt: true, unitCost: true, batchRef: true,
          lot: { select: { lotNumber: true } },
          item: { select: { category: { select: { profile: { select: { dispenseType: true } } } } } },
        },
      });
      if (!record) throw new Error("ไม่พบรายการรับเข้า");

      // ── เลขล็อต ──
      let lotNumber = record.lot?.lotNumber ?? null;
      if (parsed.data.lotNumber !== undefined) {
        if (!record.lotId) throw new Error("ใบรับเข้านี้ไม่ได้แยกล็อต จึงไม่มีเลขล็อตให้แก้");
        const next = parsed.data.lotNumber;
        if (next !== lotNumber) {
          const clash = await tx.lot.findUnique({
            where: { itemId_lotNumber: { itemId: record.itemId, lotNumber: next } },
          });
          if (clash) throw new Error(`ล็อต "${next}" มีอยู่แล้วในพัสดุนี้`);
          await tx.lot.update({ where: { id: record.lotId }, data: { lotNumber: next } });
          // เบิกจ่ายเก่าอ้างล็อตนี้อยู่ — เปลี่ยนป้ายคือเขียนความหมายของประวัติเก่าทับ ต้องมีร่องรอย
          await tx.itemFieldLog.create({
            data: {
              itemId: record.itemId,
              field: "เลขล็อต",
              fromLabel: lotNumber,
              toLabel: next,
              changedBy: auth.user.userId,
            },
          });
          lotNumber = next;
        }
      }

      // ── ป้ายงวดของใบที่ไม่มีล็อต ──
      // คนละช่องกับเลขล็อตในฐานข้อมูล แต่เป็นช่องเดียวกันบนจอ: ใบไหนมีล็อต เลขล็อตคือชื่องวด
      // ของมัน (และใช้ร่วมกับใบอื่น) ใบไหนไม่มี ก็ตั้งชื่องวดของใบตัวเองได้
      let batchRef = record.batchRef;
      if (parsed.data.batchRef !== undefined) {
        if (record.lotId) throw new Error("ใบรับเข้านี้แยกล็อตอยู่แล้ว ชื่องวดของมันคือเลขล็อต");
        const next = parsed.data.batchRef?.trim() || null;
        if (next !== batchRef) {
          await tx.receiveRecord.update({ where: { id }, data: { batchRef: next } });
          await tx.itemFieldLog.create({
            data: {
              itemId: record.itemId,
              field: "ชื่องวดรับเข้า",
              fromLabel: batchRef,
              toLabel: next,
              changedBy: auth.user.userId,
            },
          });
          batchRef = next;
        }
      }

      // ── ราคาต่อหน่วย ──
      let unitCost = record.unitCost;
      if (parsed.data.unitCost !== undefined) {
        const row = await tx.receiveRecord.update({
          where: { id },
          data: { unitCost: parsed.data.unitCost },
          select: { unitCost: true },
        });
        unitCost = row.unitCost;

        // ใบเก็บได้แค่ราคาปัจจุบัน — ร่องรอยว่าเคยเป็นเท่าไหร่ ล็อตไหน ใครแก้ อยู่ในแถวนี้แถวเดียว
        // เขียนเฉพาะตอนตัวเลขขยับจริง: กดบันทึกทับค่าเดิมไม่ใช่การแก้ราคา
        if (record.unitCost !== unitCost) {
          await tx.receivePriceLog.create({
            data: {
              receiveId: record.id,
              itemId: record.itemId,
              lotId: record.lotId,
              lotNumber,
              fromCost: record.unitCost,
              toCost: unitCost,
              changedBy: auth.user.userId,
            },
          });
        }

        // เหมือน POST เป๊ะ: ราคาอยู่ที่ใบรับเข้า ส่วน Item.purchasePrice / Lot.unitCost เป็นค่าที่
        // derive จากใบรับเข้าทั้งหมดของมัน — แก้ใบไหนก็ตาม ตัวเลขในรายงานตามทันทีโดยไม่ต้อง backfill.
        if (record.item.category.profile?.dispenseType === "CONSUMABLE" && record.lotId) {
          await syncLotUnitCost(tx, record.lotId);
        }
        await syncItemPurchasePrice(tx, record.itemId, record.receivedAt);
      }

      return { id: record.id, unitCost, lotNumber, batchRef };
    });

    return json(updated);
  } catch (err) {
    return handleError(err, "แก้ใบรับเข้าไม่สำเร็จ");
  }
}
