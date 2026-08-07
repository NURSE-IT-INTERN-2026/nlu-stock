import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleError, notFound, error } from "@/lib/api-utils";
import { recomputeItemCounts } from "@/lib/stock";
import { logReturn } from "@/lib/returns";
import { ItemStatus } from "@/generated/prisma/enums";
import { z } from "zod";

const bodySchema = z.object({
  quantity: z.number().int().min(1).optional(),
  // Where the stock ends up. Required: นำไปใช้งาน took it somewhere, so คืนเข้าคลัง has to
  // say where it went — otherwise the units land back in a total with no place attached.
  destLocationId: z.string().min(1),
  note: z.string().max(500).optional().nullable(),
});

/**
 * คืนเข้าคลัง for one open นำไปใช้งาน record.
 *
 * Returning somewhere OTHER than the item's registered location is a move, not a homecoming:
 * the old record closes and a fresh INUSE record opens at the destination. That keeps one
 * rule true everywhere — stock away from its registered location is always accounted for by
 * an open INUSE record, never by a bare number — which is what lets lib/distribution.ts
 * derive the breakdown instead of storing (and having to reconcile) a per-room counter.
 *
 * It also means such stock stays ใช้งานอยู่ rather than ว่าง. Chairs standing in a classroom
 * are not something the next person can draw from the storeroom; collecting them is a real
 * act, and this is the screen where that act gets recorded.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
  const { destLocationId, note } = parsed.data;

  const record = await prisma.dispenseRecord.findUnique({
    where: { id },
    include: { item: { select: { id: true, locationId: true, trackIndividually: true } } },
  });
  if (!record) return notFound("ไม่พบรายการนำไปใช้งาน");
  if (record.loanType !== "INUSE" || record.returnedAt) return error("รายการนี้ไม่ได้อยู่ระหว่างนำไปใช้งาน");

  const dest = await prisma.location.findUnique({ where: { id: destLocationId }, select: { id: true } });
  if (!dest) return notFound("ไม่พบสถานที่ปลายทาง");

  const outstanding = record.quantity - record.resolvedQty;
  // A tracked piece is one physical thing — the whole record resolves or nothing does.
  const qty = record.subItemId ? outstanding : Math.min(parsed.data.quantity ?? outstanding, outstanding);
  if (qty < 1) return error("ไม่มีจำนวนคงค้างให้คืน");

  const isMove = destLocationId !== record.item.locationId;

  try {
    await prisma.$transaction(async (tx) => {
      const resolved = record.resolvedQty + qty;
      await tx.dispenseRecord.update({
        where: { id: record.id },
        data: {
          resolvedQty: resolved,
          ...(resolved >= record.quantity
            ? { returnedAt: new Date(), returnCondition: "AVAILABLE" as const }
            : {}),
        },
      });

      await logReturn(tx, {
        itemId: record.itemId,
        subItemId: record.subItemId,
        dispenseRecordId: record.id,
        quantity: qty,
        condition: "AVAILABLE",
        notes: note ?? null,
        userId: auth.user.userId,
      });

      if (isMove) {
        // Still in use, just somewhere else. No ItemStatusLog: the piece never left IN_USE,
        // and api/dispense stays the only writer that moves a piece INTO a loaned status.
        await tx.dispenseRecord.create({
          data: {
            itemId: record.itemId,
            subItemId: record.subItemId,
            quantity: qty,
            locationId: destLocationId,
            loanType: "INUSE",
            staffId: auth.user.userId,
            notes: note ?? null,
          },
        });
        if (record.subItemId) {
          await tx.subItem.update({ where: { id: record.subItemId }, data: { locationId: destLocationId } });
        }
        // availableQty deliberately untouched for COUNT: the units never came back to the
        // shelf, they went straight from one room to another.
      } else if (record.subItemId) {
        await tx.subItem.update({
          where: { id: record.subItemId },
          // null, not the item's own id — "wherever the spec lives", the convention the
          // whole app reads through (see returnLocationUpdate in lib/returns.ts).
          data: { status: ItemStatus.AVAILABLE, locationId: null },
        });
        await tx.itemStatusLog.create({
          data: {
            itemId: record.itemId,
            subItemId: record.subItemId,
            previousStatus: ItemStatus.IN_USE,
            newStatus: ItemStatus.AVAILABLE,
            reason: note ? `คืนเข้าคลัง (${note})` : "คืนเข้าคลัง",
            changedBy: auth.user.userId,
          },
        });
      } else {
        await tx.item.update({
          where: { id: record.itemId },
          data: { availableQty: { increment: qty } },
        });
      }

      await recomputeItemCounts(tx, record.itemId);
    });

    return NextResponse.json({ success: true, quantity: qty, moved: isMove });
  } catch (err) {
    return handleError(err, "คืนเข้าคลังไม่สำเร็จ");
  }
}
