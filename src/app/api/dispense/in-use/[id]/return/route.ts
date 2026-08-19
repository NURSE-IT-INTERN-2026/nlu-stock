import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, handleError, notFound, error } from "@/lib/api-utils";
import { recomputeItemCounts } from "@/lib/stock";
import { logReturn } from "@/lib/returns";
import { ItemStatus } from "@/generated/prisma/enums";
import { z } from "zod";

const bodySchema = z.object({
  quantity: z.number().int().min(1).optional(),
  note: z.string().max(500).optional().nullable(),
});

/**
 * คืนเข้าคลัง for one open นำไปใช้งาน record. Stock comes back ว่าง, at its registered
 * สถานที่จัดเก็บ — the one in ตั้งค่า is the item's home, and returning is coming home.
 *
 * This screen used to accept a destination, and picking anything but the registered location
 * closed the record only to open a fresh INUSE one there: the stock never became available,
 * so คืน could silently mean "still out, somewhere else". One act, two outcomes, told apart
 * by a dropdown nobody read. Moving where a thing lives is now its own act (ย้ายที่ตั้ง on
 * the item) — คืนก่อน แล้วค่อยย้าย — and this endpoint has exactly one outcome.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth.denied) return auth.denied;

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
  const { note } = parsed.data;

  const record = await prisma.dispenseRecord.findUnique({ where: { id } });
  if (!record) return notFound("ไม่พบรายการนำไปใช้งาน");
  if (record.loanType !== "INUSE" || record.returnedAt) return error("รายการนี้ไม่ได้อยู่ระหว่างนำไปใช้งาน");

  const outstanding = record.quantity - record.resolvedQty;
  // A tracked piece is one physical thing — the whole record resolves or nothing does.
  const qty = record.subItemId ? outstanding : Math.min(parsed.data.quantity ?? outstanding, outstanding);
  if (qty < 1) return error("ไม่มีจำนวนคงค้างให้คืน");

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

      if (record.subItemId) {
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

    return NextResponse.json({ success: true, quantity: qty });
  } catch (err) {
    return handleError(err, "คืนเข้าคลังไม่สำเร็จ");
  }
}
