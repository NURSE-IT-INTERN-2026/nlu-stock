import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, forbidden } from "@/lib/api-utils";
import { allocateAcrossLots, recomputeItemCounts } from "@/lib/stock";
import { ItemStatus } from "@/generated/prisma/enums";
import { AdjustmentReason } from "@/generated/prisma/enums";

// Reverse a LOST event ("เรียกคืน"): restore the piece/qty to available, mark the source
// record recoveredAt so it can't be recovered twice. source ∈ PIECE | ADJUSTMENT | RETURN.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth.denied) return auth.denied;
  if (auth.user.role === "INSTRUCTOR") return forbidden();

  const { id: itemId } = await params;
  const body = await req.json();
  const source = body?.source as string;
  const recordId = body?.recordId as string;
  const note = (body?.note as string | undefined)?.trim() || null;
  if (!recordId || !["PIECE", "ADJUSTMENT"].includes(source)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const qty = await prisma.$transaction(async (tx) => {
      if (source === "PIECE") {
        const log = await tx.itemStatusLog.findUnique({ where: { id: recordId } });
        if (!log || log.itemId !== itemId) throw new Error("ไม่พบรายการ");
        if (log.newStatus !== ItemStatus.LOST) throw new Error("ไม่ใช่รายการสูญหาย");
        if (log.recoveredAt) throw new Error("เรียกคืนแล้ว");
        if (!log.subItemId) throw new Error("ไม่พบชิ้นย่อย");
        const sub = await tx.subItem.findUnique({ where: { id: log.subItemId } });
        if (!sub) throw new Error("ไม่พบชิ้นย่อย");
        await tx.subItem.update({ where: { id: sub.id }, data: { status: ItemStatus.AVAILABLE } });
        await tx.itemStatusLog.create({
          data: { itemId, subItemId: sub.id, previousStatus: ItemStatus.LOST, newStatus: ItemStatus.AVAILABLE, reason: note ? `เรียกคืนสูญหาย (${note})` : "เรียกคืนสูญหาย", changedBy: auth.user.userId },
        });
        await tx.itemStatusLog.update({ where: { id: recordId }, data: { recoveredAt: new Date() } });
        await recomputeItemCounts(tx, itemId); // tracked counts derive from sub statuses
        return 1;
      }

      // ADJUSTMENT (count items): put the qty back on the shelf.
      const adj = await tx.stockAdjustment.findUnique({ where: { id: recordId } });
      if (!adj || adj.itemId !== itemId) throw new Error("ไม่พบรายการ");
      if (adj.reason !== AdjustmentReason.LOST) throw new Error("ไม่ใช่รายการสูญหาย");
      if (adj.recoveredAt) throw new Error("เรียกคืนแล้ว");
      const qty = adj.previousQty - adj.newQty;
      const origNotes = adj.notes ?? "";
      await tx.stockAdjustment.update({ where: { id: recordId }, data: { recoveredAt: new Date() } });
      const item = await tx.item.findUnique({ where: { id: itemId }, select: { availableQty: true } });
      if (!item) throw new Error("ไม่พบพัสดุ");
      const prev = item.availableQty;
      if (adj.lotId) {
        // Loss was booked against a specific lot (ตรวจนับ lot ขาด) — put it back there,
        // then let the recompute re-derive availableQty from SUM(lots). Incrementing the
        // item directly would desync and get wiped by the next recompute.
        await tx.lot.update({ where: { id: adj.lotId }, data: { remainingQty: { increment: qty } } });
        await recomputeItemCounts(tx, itemId);
      } else {
        // Item-level loss: land it on a lot when the item has any (otherwise the next
        // recompute resyncs availableQty from SUM(lots) and eats the recovery), else
        // straight onto the item.
        const landed = await allocateAcrossLots(tx, itemId, qty);
        if (landed) await recomputeItemCounts(tx, itemId);
        else await tx.item.update({ where: { id: itemId }, data: { availableQty: { increment: qty } } });
      }
      await tx.stockAdjustment.create({
        data: {
          itemId,
          delta: qty,
          previousQty: prev,
          newQty: prev + qty,
          reason: AdjustmentReason.OTHER,
          notes: `เรียกคืนสูญหาย${origNotes ? ` (${origNotes})` : ""}${note ? ` — ${note}` : ""}`,
          adjustedBy: auth.user.userId,
        },
      });
      return qty;
    });
    return NextResponse.json({ ok: true, qty });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "เรียกคืนไม่สำเร็จ";
    return NextResponse.json({ error: msg }, { status: msg === "เรียกคืนแล้ว" ? 409 : 400 });
  }
}
