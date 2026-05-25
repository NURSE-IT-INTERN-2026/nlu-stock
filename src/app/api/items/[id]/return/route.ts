import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ItemStatus } from "@/generated/prisma/enums";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "INSTRUCTOR") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: itemId } = await params;

  const body = await _req.json();
  const subItemId = body.subItemId as string | undefined;

  try {
    await prisma.$transaction(async (tx) => {
      if (subItemId) {
        // Tracked durable: return specific sub-item
        const sub = await tx.subItem.findUnique({ where: { id: subItemId } });
        if (!sub) throw new Error("Sub-item not found");
        if (sub.status !== ItemStatus.CHECKED_OUT) throw new Error(`Sub-item is not checked out (status: ${sub.status})`);

        await tx.subItem.update({
          where: { id: subItemId },
          data: { status: ItemStatus.AVAILABLE },
        });
        await tx.itemStatusLog.create({
          data: {
            itemId,
            subItemId,
            previousStatus: ItemStatus.CHECKED_OUT,
            newStatus: ItemStatus.AVAILABLE,
            reason: "Returned",
            changedBy: session.userId,
          },
        });
        // Mark the most recent dispense record as returned
        const dispense = await tx.dispenseRecord.findFirst({
          where: { itemId, subItemId, returnedAt: null },
          orderBy: { dispensedAt: "desc" },
        });
        if (dispense) {
          await tx.dispenseRecord.update({
            where: { id: dispense.id },
            data: { returnedAt: new Date() },
          });
        }
      } else {
        // Non-tracked durable: return quantity
        const qty = body.quantity as number;
        if (!qty || qty <= 0) throw new Error("Quantity required");

        const item = await tx.item.findUnique({ where: { id: itemId } });
        if (!item) throw new Error("Item not found");

        await tx.item.update({
          where: { id: itemId },
          data: { availableQty: { increment: qty } },
        });
        // Mark the most recent dispense record as returned
        const dispense = await tx.dispenseRecord.findFirst({
          where: { itemId, lotId: null, subItemId: null, returnedAt: null },
          orderBy: { dispensedAt: "desc" },
        });
        if (dispense) {
          await tx.dispenseRecord.update({
            where: { id: dispense.id },
            data: { returnedAt: new Date() },
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Return failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
